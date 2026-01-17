const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { DAL } = require('./DAL/mongoDAL');

const app = express();
const port = 7653;


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
  })
);

const baseUrl = `http://localhost:{port}`;

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/users', async (req, res) => {
  try {
    const { name, email, password, address } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    if (await DAL.getUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const user = {
      id: Date.now().toString(),
      name,
      email,
      password: await bcrypt.hash(password, 10),
      address
    };

    await DAL.createUser(user);

    res.status(201).json({
      message: 'User created',
      links: {
        self: `${baseUrl}/users/${user.id}`,
        signin: `${baseUrl}/signin`,
        games: `${baseUrl}/users/${user.id}/games`
      }
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/users/:id', async (req, res) => {
  const user = await DAL.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
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
      allGames: `${baseUrl}/games`
    }
  });
});

app.put('/users/:id', async (req, res) => {
  const updated = await DAL.updateUser(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.status(204).send();
});


app.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const user = await DAL.getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;

  res.status(200).json({
    message: 'Signed in',
    links: {
      self: `${baseUrl}/users/${user.id}`,
      myGames: `${baseUrl}/my/games`,
      createGame: `${baseUrl}/games`,
      logout: `${baseUrl}/logout`
    }
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({
      message: 'Logged out',
      links: {
        signin: `${baseUrl}/signin`,
        register: `${baseUrl}/users`
      }
    });
  });
});


app.post('/games', requireAuth, async (req, res) => {
  const { name, system, condition, price } = req.body;

  if (!name || !system) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const game = {
    id: Date.now().toString(),
    name,
    system,
    condition,
    price,
    ownerId: req.session.userId
  };

  await DAL.createGame(game);

  res.status(201).json({
    message: 'Game created',
    links: {
      self: `${baseUrl}/games/${game.id}`,
      update: `${baseUrl}/games/${game.id}`,
      delete: `${baseUrl}/games/${game.id}`,
      owner: `${baseUrl}/users/${game.ownerId}`
    }
  });
});

app.get('/games', async (req, res) => {
  const { search } = req.query;
  const games = search
    ? await DAL.searchGames(search)
    : await DAL.getGames();

  res.status(200).json({
    count: games.length,
    games: games.map(g => ({
      ...g,
      links: {
        self: `${baseUrl}/games/${g.id}`,
        owner: `${baseUrl}/users/${g.ownerId}`
      }
    })),
    links: {
      search: `${baseUrl}/games?search={term}`,
      create: `${baseUrl}/games`
    }
  });
});

app.get('/games/:id', async (req, res) => {
  const game = await DAL.getGameById(req.params.id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.status(200).json({
    ...game,
    links: {
      self: `${baseUrl}/games/${game.id}`,
      update: `${baseUrl}/games/${game.id}`,
      delete: `${baseUrl}/games/${game.id}`,
      owner: `${baseUrl}/users/${game.ownerId}`
    }
  });
});

app.put('/games/:id', requireAuth, async (req, res) => {
  const updated = await DAL.updateGame(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.status(204).send();
});

app.delete('/games/:id', requireAuth, async (req, res) => {
  const result = await DAL.deleteGame(req.params.id);
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.status(204).send();
});


app.get('/my/games', requireAuth, async (req, res) => {
  const games = await DAL.getGamesByOwner(req.session.userId);
  res.status(200).json({
    games,
    links: {
      self: `${baseUrl}/my/games`,
      create: `${baseUrl}/games`
    }
  });
});

app.get('/users/:id/games', async (req, res) => {
  const games = await DAL.getGamesByOwner(req.params.id);
  res.status(200).json({
    games,
    links: {
      owner: `${baseUrl}/users/${req.params.id}`,
      allGames: `${baseUrl}/games`
    }
  });
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
