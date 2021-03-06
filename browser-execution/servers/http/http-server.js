const fs = require('fs');
const path = require('path');
const http = require('http');
const nStatic = require('node-static');

const { container, httpServerConfig } = require('../../../shared/config.js').getContainerConfig();

const port = httpServerConfig && httpServerConfig.port ? httpServerConfig.port : '8080';
const httpPath = container && container.httpAppDir ? container.httpAppDir : path.join(__dirname, '../../app');
const logger = require('../../../shared/logger').newInstance('HTTP Server');

module.exports.start = () => {
  if (!fs.existsSync(`${httpPath}/index.html`)) {
    logger.logError('No index.html file found');
    throw new Error('No index.html file found');
  }

  const fileServer = new nStatic.Server(httpPath);
  const server = http.createServer((req, res) => {
    logger.logDebug(`Requested ${req.url} with method ${req.method}`);
    fileServer.serve(req, res);
  });

  server.on('error', (error) => {
    logger.logError('Http Server Error:', error);
    throw error;
  });

  server.listen(port, () => {
    logger.logInfo('Starting http server on port...', port);
  });
};
