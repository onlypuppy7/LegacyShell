//
import chalk from 'chalk';
//

const logMethods = {
    green: (...args) => console.log(chalk.green(...args)),
    red: (...args) => console.log(chalk.red(...args)),
    yellow: (...args) => console.log(chalk.yellow(...args)),
    blue: (...args) => console.log(chalk.blue(...args)),
    cyan: (...args) => console.log(chalk.cyan(...args)),
    magenta: (...args) => console.log(chalk.magenta(...args)),
    white: (...args) => console.log(chalk.white(...args)),
    gray: (...args) => console.log(chalk.gray(...args)),
    black: (...args) => console.log(chalk.black(...args)),
    pink: (...args) => console.log(chalk.hex('#FFC0CB')(...args)),
    orange: (...args) => console.log(chalk.hex('#FFA500')(...args)),
    purple: (...args) => console.log(chalk.hex('#800080')(...args)),
    brown: (...args) => console.log(chalk.hex('#A52A2A')(...args)),
    beige: (...args) => console.log(chalk.hex('#F5F5DC')(...args)),

    bgGreen: (...args) => console.log(chalk.bgGreen(...args)),
    bgRed: (...args) => console.log(chalk.bgRed(...args)),
    bgYellow: (...args) => console.log(chalk.bgYellow(...args)),
    bgBlue: (...args) => console.log(chalk.bgBlue(...args)),
    bgCyan: (...args) => console.log(chalk.bgCyan(...args)),
    bgMagenta: (...args) => console.log(chalk.bgMagenta(...args)),
    bgWhite: (...args) => console.log(chalk.bgWhite(...args)),
    bgGray: (...args) => console.log(chalk.bgGray(...args)),
    bgBlack: (...args) => console.log(chalk.bgBlack(...args)),
    bgPink: (...args) => console.log(chalk.bgHex('#FFC0CB')(...args)),
    bgOrange: (...args) => console.log(chalk.bgHex('#FFA500')(...args)),
    bgPurple: (...args) => console.log(chalk.bgHex('#800080')(...args)),
    bgBrown: (...args) => console.log(chalk.bgHex('#A52A2A')(...args)),
    bgBeige: (...args) => console.log(chalk.bgHex('#F5F5DC')(...args)),

    bold: (...args) => console.log(chalk.bold(...args)),
    italic: (...args) => console.log(chalk.italic(...args)),
    underline: (...args) => console.log(chalk.underline(...args)),
    strikethrough: (...args) => console.log(chalk.strikethrough(...args)),
    dim: (...args) => console.log(chalk.dim(...args)),

    success: (...args) => console.log(chalk.green.bold("[SUCCESS]", ...args)),
    error: (...args) => console.log(chalk.red.bold("[ERROR]", ...args)),
    warning: (...args) => console.log(chalk.yellow.bold("[WARN]", ...args)),
    info: (...args) => console.log(chalk.blue.bold("[INFO]", ...args)),
    highlight: (...args) => console.log(chalk.bgYellow.black.bold(...args)),
    muted: (...args) => console.log(chalk.gray.italic(...args)),
    special: (...args) => console.log(chalk.cyan.underline(...args)),
    custom: (message, color) => console.log(chalk[color](message)),
    customBg: (message, color) => console.log(chalk[color](message))
};

export default logMethods;