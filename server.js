const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { DAL } = require("./DAL/mongoDAL");
const { connectProducer, sendNotification } = require("./kafka");

const { RedisStore } = require("connect-redis");
const { createClient } = require("redis");

const app = express();
const port = 7653;

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || "redis",
    port: 6379,
  },
});

(async () => {
  await connectProducer();
})();

redisClient.on("error", (err) => console.error("Redis Client Error", err));
redisClient.on("connect", () => console.log("Connected to Redis"));

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error("Failed to connect to Redis — sessions will not work!", err);
  }
})();

app.use(
  session({
    store: new RedisStore({
      client: redisClient,
      prefix: "sess:",
      ttl: 24 * 60 * 60,
    }),
    secret: process.env.SESSION_SECRET || "keyboard cat",
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
  }),
);

const baseUrl = `http://localhost:8080`;

app.post("/users", async (req, res) => {
  try {
    const { name, email, password, address } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (await DAL.getUserByEmail(email)) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const user = {
      id: Date.now().toString(),
      name,
      email,
      password: await bcrypt.hash(password, 10),
      address,
    };

    await DAL.createUser(user);

    res.status(201).json({
      message: "User created",
      links: {
        self: `${baseUrl}/users/${user.id}`,
        signin: `${baseUrl}/signin`,
        games: `${baseUrl}/users/${user.id}/games`,
      },
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/users/:id", async (req, res) => {
  const user = await DAL.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.status(200).json({
    id: user.id,
    name: user.name,
    email: user.email,
    address: user.address,
    links: {
      self: `${baseUrl}/users/${user.id}`,
      update: `${baseUrl}/users/${user.id}`,
      games: `${baseUrl}/users/${user.id}/games`,
      allGames: `${baseUrl}/games`,
    },
  });
});

app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { password, ...rest } = req.body;

  const existing = await DAL.getUserById(id);
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }

  let updateDoc = { ...rest };
  let passwordChanged = false;

  if (password) {
    updateDoc.password = await bcrypt.hash(password, 10);
    passwordChanged = true;
  }

  await DAL.updateUser(id, updateDoc);

  if (passwordChanged) {
    await sendNotification("PASSWORD_CHANGED", {
      userId: id,
      email: existing.email,
    });
  }

  res.status(204).send();
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const user = await DAL.getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  req.session.userId = user.id;
  console.log("assinged session id");
  console.log(user.id);

  res.status(200).json({
    message: "Signed in",
    links: {
      self: `${baseUrl}/users/${user.id}`,
      myGames: `${baseUrl}/my/games`,
      createGame: `${baseUrl}/games`,
      logout: `${baseUrl}/logout`,
    },
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({
      message: "Logged out",
      links: {
        signin: `${baseUrl}/signin`,
        register: `${baseUrl}/users`,
      },
    });
  });
});

app.post("/games", async (req, res) => {
  const { name, system, condition, price } = req.body;

  if (!req.session.userId) {
    console.log(req.session);
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!name || !system) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const game = {
    id: Date.now().toString(),
    name,
    system,
    condition,
    price,
    ownerId: req.session.userId,
  };

  await DAL.createGame(game);

  res.status(201).json({
    message: "Game created",
    links: {
      self: `${baseUrl}/games/${game.id}`,
      update: `${baseUrl}/games/${game.id}`,
      delete: `${baseUrl}/games/${game.id}`,
      owner: `${baseUrl}/users/${game.ownerId}`,
    },
  });
});

app.get("/games", async (req, res) => {
  const { search } = req.query;
  const games = search ? await DAL.searchGames(search) : await DAL.getGames();

  res.status(200).json({
    count: games.length,
    games: games.map((g) => ({
      ...g,
      links: {
        self: `${baseUrl}/games/${g.id}`,
        owner: `${baseUrl}/users/${g.ownerId}`,
      },
    })),
    links: {
      search: `${baseUrl}/games?search={term}`,
      create: `${baseUrl}/games`,
    },
  });
});

app.get("/games/:id", async (req, res) => {
  const game = await DAL.getGameById(req.params.id);
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  res.status(200).json({
    ...game,
    links: {
      self: `${baseUrl}/games/${game.id}`,
      update: `${baseUrl}/games/${game.id}`,
      delete: `${baseUrl}/games/${game.id}`,
      owner: `${baseUrl}/users/${game.ownerId}`,
    },
  });
});

app.put("/games/:id", async (req, res) => {
  const updated = await DAL.updateGame(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.status(204).send();
});

app.delete("/games/:id", async (req, res) => {
  const result = await DAL.deleteGame(req.params.id);
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.status(204).send();
});

app.get("/my/games", async (req, res) => {
  const games = await DAL.getGamesByOwner(req.session.userId);
  res.status(200).json({
    games,
    links: {
      self: `${baseUrl}/my/games`,
      create: `${baseUrl}/games`,
    },
  });
});

app.get("/users/:id/games", async (req, res) => {
  const games = await DAL.getGamesByOwner(req.params.id);
  res.status(200).json({
    games,
    links: {
      owner: `${baseUrl}/users/${req.params.id}`,
      allGames: `${baseUrl}/games`,
    },
  });
});

const checkGameOwnership = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const game = await DAL.getGameById(req.params.gameId);
  if (!game || game.ownerId !== req.session.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }
  req.game = game;
  next();
};

app.post("/offers", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const { gameId, amount } = req.body;

  if (!gameId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Missing gameId or invalid amount" });
  }

  const game = await DAL.getGameById(gameId);
  if (!game || game.ownerId === req.session.userId) {
    return res.status(400).json({ error: "Invalid game" });
  }

  const offer = {
    id: Date.now().toString(),
    gameId,
    buyerId: req.session.userId,
    amount,
    status: "pending",
  };

  await DAL.createOffer(offer);
  const owner = await DAL.getUserById(game.ownerId);
  const buyer = await DAL.getUserById(req.session.userId);

  await sendNotification("OFFER_CREATED", {
    offerId: offer.id,
    gameId: game.id,
    amount: offer.amount,
    offeror: { id: buyer.id, email: buyer.email },
    offeree: { id: owner.id, email: owner.email },
  });

  res.status(201).json({
    message: "Offer created",
    offer,
    links: {
      self: `${baseUrl}/offers/${offer.id}`,
      game: `${baseUrl}/games/${gameId}`,
    },
  });
});

app.get("/offers/:offerId", async (req, res) => {
  const offer = await DAL.getOfferById(req.params.offerId);
  if (!offer) {
    return res.status(404).json({ error: "Offer not found" });
  }

  res.status(200).json({
    ...offer,
    links: {
      self: `${baseUrl}/offers/${offer.id}`,
      game: `${baseUrl}/games/${offer.gameId}`,
      accept: `${baseUrl}/offers/${offer.id}/accept`,
      reject: `${baseUrl}/offers/${offer.id}/reject`,
    },
  });
});

app.post("/offers/:offerId/accept", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const offer = await DAL.getOfferById(req.params.offerId);
  if (!offer || offer.status !== "pending") {
    return res.status(400).json({ error: "Invalid offer" });
  }

  const game = await DAL.getGameById(offer.gameId);
  if (game.ownerId !== req.session.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  await DAL.updateOffer(req.params.offerId, { status: "accepted" });

  const buyer = await DAL.getUserById(offer.buyerId);
  const owner = await DAL.getUserById(game.ownerId);

  await sendNotification("OFFER_ACCEPTED", {
    offerId: offer.id,
    gameId: game.id,
    amount: offer.amount,
    offeror: { id: buyer.id, email: buyer.email },
    offeree: { id: owner.id, email: owner.email },
  });

  res.status(200).json({ message: "Offer accepted" });
});

app.post("/offers/:offerId/reject", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const offer = await DAL.getOfferById(req.params.offerId);
  if (!offer || offer.status !== "pending") {
    return res.status(400).json({ error: "Invalid offer" });
  }

  const game = await DAL.getGameById(offer.gameId);
  if (game.ownerId !== req.session.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  await DAL.updateOffer(req.params.offerId, { status: "rejected" });

  const buyer = await DAL.getUserById(offer.buyerId);
  const owner = await DAL.getUserById(game.ownerId);

  await sendNotification("OFFER_REJECTED", {
    offerId: offer.id,
    gameId: game.id,
    amount: offer.amount,
    offeror: { id: buyer.id, email: buyer.email },
    offeree: { id: owner.id, email: owner.email },
  });

  res.status(200).json({ message: "Offer rejected" });
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
