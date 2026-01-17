const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://mongo-1:27017';
const dbName = 'gameStore';

let client;
let db;

async function connect() {
  if (!db) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('games').createIndex({ name: 'text', system: 'text' });

    console.log('MongoDB connected');
  }
  return db;
}


const DAL = {

  /* 
     USER CRUD
  */

  async createUser(user) {
    const db = await connect();
    await db.collection('users').insertOne(user);
    return user;
  },

  async getUsers() {
    const db = await connect();
    return db.collection('users').find({}).toArray();
  },

  async getUserById(id) {
    const db = await connect();
    return db.collection('users').findOne({ id });
  },

  async getUserByEmail(email) {
    const db = await connect();
    return db.collection('users').findOne({ email });
  },

  async updateUser(id, updates) {
    const db = await connect();

    const allowedUpdates = {
      name: updates.name,
      address: updates.address
    };

    Object.keys(allowedUpdates).forEach(
      key => allowedUpdates[key] === undefined && delete allowedUpdates[key]
    );

    const result = await db.collection('users').updateOne(
      { id },
      { $set: allowedUpdates }
    );

    return result.matchedCount > 0;
  },

  async deleteUser(id) {
    const db = await connect();
    return db.collection('users').deleteOne({ id });
  },

  /* 
     GAME CRUD
  */

  async createGame(game) {
    const db = await connect();
    await db.collection('games').insertOne(game);
    return game;
  },

  async getGames(query = {}) {
    const db = await connect();
    return db.collection('games').find(query).toArray();
  },

  async getGameById(id) {
    const db = await connect();
    return db.collection('games').findOne({ id });
  },

  async updateGame(id, updates) {
    const db = await connect();

    const allowedUpdates = {
      name: updates.name,
      system: updates.system,
      condition: updates.condition,
      price: updates.price
    };

    Object.keys(allowedUpdates).forEach(
      key => allowedUpdates[key] === undefined && delete allowedUpdates[key]
    );

    const result = await db.collection('games').updateOne(
      { id },
      { $set: allowedUpdates }
    );

    return result.matchedCount > 0;
  },

  async deleteGame(id) {
    const db = await connect();
    return db.collection('games').deleteOne({ id });
  },

  /* 
     SEARCH & OWNERSHIP
  */

  async getGamesByOwner(userId) {
    const db = await connect();
    return db.collection('games').find({ ownerId: userId }).toArray();
  },

  async searchGames(term) {
    const db = await connect();
    return db.collection('games')
      .find({ $text: { $search: term } })
      .toArray();
  },

  /* 
     CLEANUP
  */

  async close() {
    if (client) {
      await client.close();
      client = null;
      db = null;
    }
  }
};

module.exports = { DAL };
