const fs = require('fs');
const fse = require('fs-extra'); // TODO: Do implementation of recursive copy to avoid this dependency
const path = require('path');
const util = require('util');
const http = require('http');
const nStatic = require('node-static');

const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const existsFile = util.promisify(fs.exists);

const { visualizerServerConfig } = require('../../shared/config.js').getHostConfig();

const port = visualizerServerConfig && visualizerServerConfig.port ? visualizerServerConfig.port : '8080';
const visualizerPath = path.join(__dirname, './visualizer/dist');
const logger = require('../../shared/logger').newInstance('Report Manager');

const moveReportSnapshots = async (imagesDestination, runsPath) => {
  const files = await readdir(imagesDestination);
  const movedFiles = [];

  try {
    await Promise.all(files.map(async (file) => {
      // Get the full paths
      const imagePath = path.join(imagesDestination, file);
      const destinationPath = path.join(runsPath, file);

      const isFileCreated = await existsFile(destinationPath);
      if (isFileCreated) {
        return;
      }

      await fse.copy(imagePath, destinationPath);

      logger.logDebug(`Copy folder: ${imagePath} -> ${destinationPath}`);

      movedFiles.push(file);
    }));
  } catch (error) {
    logger.logWarning(`Could not copy file: ${error}`);
  }

  return movedFiles;
};


module.exports.createReportData = async (imagesDestination) => {
  try {
    const runsPath = `${visualizerPath}/runs`;
    const isRunVisualizerDirCreated = await existsFile(runsPath);
    if (!isRunVisualizerDirCreated) {
      await mkdir(runsPath);
    }

    const resultFiles = await moveReportSnapshots(imagesDestination, runsPath);

    const isRunCreated = await existsFile(`${runsPath}/runs.json`);
    let runs = [];
    if (isRunCreated) {
      const runContent = await readFile(`${runsPath}/runs.json`);
      runs = JSON.parse(runContent);
    }

    resultFiles.forEach((file) => {
      if (!runs.includes(file)) { runs.push(file); }
    });

    await writeFile(`${runsPath}/runs.json`, JSON.stringify(runs));
  } catch (e) {
    logger.logError(`Error moving report files: ${e}`);
  }
};

module.exports.visualize = () => {
  if (!fs.existsSync(`${visualizerPath}/index.html`)) {
    logger.logError('No index.html found for the visualization path');
    throw new Error('No index.html found for the visualization path');
  }

  const fileServer = new nStatic.Server(visualizerPath);
  const server = http.createServer((req, res) => {
    logger.logDebug(`Requested ${req.url} with method ${req.method}`);
    fileServer.serve(req, res);
  });

  server.on('error', (error) => {
    logger.logError('Visualizer Server Error:', error);
    throw new Error('Visualizer Server Error:', error.message);
  });

  server.listen(port, () => {
    logger.logInfo(`Visualizer Server started on http://localhost:${port}`);
  });
};
