const colors = require('colors');

const logMethods = {
    green: (message) => console.log(message.green),
    red: (message) => console.log(message.red),
    yellow: (message) => console.log(message.yellow),
    blue: (message) => console.log(message.blue),
    // Add more colors or styles as needed
};

module.exports = logMethods;
