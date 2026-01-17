let games = require('./data/games.json')
let users = require('./data/users.json')

exports.DAL = {
  // Game Functions
  async getGames(query = {}) {
    let filteredGames = games;

    // Apply filters if query object has properties
    if (query.name) {
      filteredGames = filteredGames.filter(game => 
        game.name.toLowerCase().includes(query.name.$regex.toLowerCase())
      );
    }
    if (query.system) {
      filteredGames = filteredGames.filter(game => 
        game.system.toLowerCase().includes(query.system.$regex.toLowerCase())
      );
    }
    if (query.condition) {
      filteredGames = filteredGames.filter(game => 
        game.condition === query.condition
      );
    }

    return filteredGames;
  },

  async getGameById(id) {
    return games.find(game => game.id == id) || null
  },

  async addGame(game) {
    games.push(game)
    return game
  },

  async deleteGame(id) {
    const initialLength = games.length
    games = games.filter(game => game.id != id)
    return games.length < initialLength
  },

  async updateGame(updatedGame) {
    const index = games.findIndex(game => game.id == updatedGame.id)
    if (index === -1) return false

    games[index] = updatedGame
    return true
  },

  // User Functions
  async getUsers() {
    return users
  },

  async getUserById(id) {
    return users.find(user => user.id == id) || null
  },

  async getUserByEmail(email) {
    return users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null
  },

  async addUser(user) {
    const existingUser = users.find(u => u.id == user.id)
    if (existingUser) return false

    users.push(user)
    return true
  },

  async updateUser(updatedUser) {
    const index = users.findIndex(user => user.id == updatedUser.id)
    if (index === -1) return false

    users[index] = updatedUser
    return true
  },

  async deleteUser(id) {
    const initialLength = users.length
    users = users.filter(user => user.id != id)
    return users.length < initialLength
  }
}
