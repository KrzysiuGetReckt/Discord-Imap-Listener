const winston = require("winston");
const path = require("path");

// Define log file paths
const logDir = path.resolve(__dirname, "../logs"); // ../logs relative to project root
const combinedLog = path.join(logDir, "bot-combined.log");
const errorLog = path.join(logDir, "bot-error.log");

// Create logger
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: errorLog, level: "error" }),
    new winston.transports.File({ filename: combinedLog }),
    new winston.transports.Console()
  ],
  exitOnError: false
});

module.exports = logger;