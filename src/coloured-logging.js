import chalk from 'chalk';

const logMethods = {
    green: (message) => console.log(chalk.green(message)),
    red: (message) => console.log(chalk.red(message)),
    yellow: (message) => console.log(chalk.yellow(message)),
    blue: (message) => console.log(chalk.blue(message)),
    cyan: (message) => console.log(chalk.cyan(message)),
    magenta: (message) => console.log(chalk.magenta(message)),
    white: (message) => console.log(chalk.white(message)),
    gray: (message) => console.log(chalk.gray(message)),
    black: (message) => console.log(chalk.black(message)),
    pink: (message) => console.log(chalk.hex('#FFC0CB')(message)),
    orange: (message) => console.log(chalk.hex('#FFA500')(message)),
    purple: (message) => console.log(chalk.hex('#800080')(message)),
    brown: (message) => console.log(chalk.hex('#A52A2A')(message)),
    beige: (message) => console.log(chalk.hex('#F5F5DC')(message)),

    bgGreen: (message) => console.log(chalk.bgGreen(message)),
    bgRed: (message) => console.log(chalk.bgRed(message)),
    bgYellow: (message) => console.log(chalk.bgYellow(message)),
    bgBlue: (message) => console.log(chalk.bgBlue(message)),
    bgCyan: (message) => console.log(chalk.bgCyan(message)),
    bgMagenta: (message) => console.log(chalk.bgMagenta(message)),
    bgWhite: (message) => console.log(chalk.bgWhite(message)),
    bgGray: (message) => console.log(chalk.bgGray(message)),
    bgBlack: (message) => console.log(chalk.bgBlack(message)),
    bgPink: (message) => console.log(chalk.bgHex('#FFC0CB')(message)),
    bgOrange: (message) => console.log(chalk.bgHex('#FFA500')(message)),
    bgPurple: (message) => console.log(chalk.bgHex('#800080')(message)),
    bgBrown: (message) => console.log(chalk.bgHex('#A52A2A')(message)),
    bgBeige: (message) => console.log(chalk.bgHex('#F5F5DC')(message)),

    bold: (message) => console.log(chalk.bold(message)),
    italic: (message) => console.log(chalk.italic(message)),
    underline: (message) => console.log(chalk.underline(message)),
    strikethrough: (message) => console.log(chalk.strikethrough(message)),
    dim: (message) => console.log(chalk.dim(message)),

    success: (message) => console.log(chalk.green.bold(message)),
    error: (message) => console.log(chalk.red.bold(message)),
    warning: (message) => console.log(chalk.yellow.bold(message)),
    info: (message) => console.log(chalk.blue.bold(message)),
    highlight: (message) => console.log(chalk.bgYellow.black.bold(message)),
    muted: (message) => console.log(chalk.gray.italic(message)),
    special: (message) => console.log(chalk.cyan.underline(message)),
    custom: (message, color) => console.log(chalk[color](message)),
    customBg: (message, color) => console.log(chalk[color](message))
};

export default logMethods;