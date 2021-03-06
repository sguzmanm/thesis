const fs = require('fs');
const path = require('path');
const util = require('util');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const compareImages = require('resemblejs/compareImages'); // Resemble

const config = require('../../../shared/config.js').getContainerConfig();
const logger = require('../../../shared/logger').newInstance('Snapshot Processor Comparator');

const containerConfig = config.container;
const snapshotDestinationDir = containerConfig && containerConfig.snapshotDestinationDir ? containerConfig.snapshotDestinationDir : '/tmp/runs';
const baseBrowser = config.baseBrowser || 'chrome';
const browserWaitingTime = config.browserWaitingResponseTime
  ? parseInt(config.browserWaitingResponseTime, 10) : 30000;
const startupWaitingTime = 5 * 60 * 1000; // 5min

let activeBrowsers = [...config.browsers];

// Logging
const events = [];


const removeActiveBrowser = (browser) => {
  const index = activeBrowsers.indexOf(browser);
  activeBrowsers.splice(index, 1);
  logger.logDebug(`Deactivating browser... ${browser}`);

  if (browser === baseBrowser) {
    logger.logWarning('Base browser deactivated. Nothing more to compare');
    activeBrowsers = [];
  }
};

// Maps to handle race condition of snapshot processor
const timeoutMap = {}; // Map: Browser(String)->Function
const imageMap = {}; // Map: Id(String)-> [Map:Browser(String)->Object {timestamp:long,fileNames:Array} ]

activeBrowsers.forEach((browser) => {
  timeoutMap[browser] = setTimeout(() => {
    logger.logInfo('Deactivating browser on startup');
    removeActiveBrowser(browser);
  }, startupWaitingTime);
});

const compareSnapshots = async (original, modified, dateString) => {
  const data = await compareImages(
    await readFile(original),
    await readFile(modified),
    config.resemble,
  );

  const fileSeparation = modified.split(path.sep);
  const isBefore = original.includes('before');

  const idBasePath = `${snapshotDestinationDir}/${dateString}/snapshots/${fileSeparation[fileSeparation.length - 2]}/`;
  const comparisonPath = isBefore ? `${idBasePath}comparison_before.json` : `${idBasePath}comparison_after.json`;
  await writeFile(comparisonPath, JSON.stringify({
    resemble: {
      ...data,
    },
  }));

  const resultPath = `${idBasePath}comparison_${baseBrowser}_vs_${fileSeparation[fileSeparation.length - 1]}`;
  await writeFile(resultPath, data.getBuffer());

  logger.logInfo(`Comparison for ${idBasePath} ${isBefore ? 'before' : 'after'} the given event was saved at ${resultPath}`);
};

// Browser comparison of snapshots
const compareBrowsers = async (snapshotMap, dateString) => {
  const baseImages = snapshotMap[baseBrowser].fileNames;

  try {
    const comparisonResults = activeBrowsers.map(async (browser) => {
      if (browser === baseBrowser) {
        return;
      }

      const stageResults = baseImages.map(async (baseBrowserImage, i) => {
        const comparableBrowserImage = snapshotMap[browser].fileNames[i];
        await compareSnapshots(
          `${snapshotDestinationDir}/${dateString}/snapshots/${baseBrowserImage}`,
          `${snapshotDestinationDir}/${dateString}/snapshots/${comparableBrowserImage}`,
          dateString,
        );
      });

      await Promise.all(stageResults);
    });

    await Promise.all(comparisonResults);
  } catch (error) {
    logger.logWarning('Image comparison failed!!! ', error.message, error);
  }
};

const makeIdComparison = async (id, event, dateString) => {
  if (Object.keys(imageMap[id]).length !== activeBrowsers.length || activeBrowsers.length <= 1) {
    return;
  }

  await compareBrowsers(imageMap[id], dateString);

  const { eventType, eventName } = event;
  events.push({
    id,
    eventType,
    eventName,
    comparisonTimestamp: new Date().getTime(),
    browsers: Object.keys(imageMap[id]).map((browser) => ({
      name: browser,
      sentSnapshotTimestamp: imageMap[id][browser].timestamp,
    })),
  });
};

const deactivateBrowser = async (browser, event, requestData) => {
  removeActiveBrowser(browser);

  // Check images sent by remaining browsers if complete
  const keys = Object.keys(imageMap);
  const results = keys.map(async (id) => {
    delete imageMap[id][browser]; // Remove inactive browser
    await makeIdComparison(id, event, requestData.dateString);
  });

  await Promise.all(results);
};

module.exports.registerImage = async (imageRequestBody, requestData) => {
  const {
    browser, id, eventType, eventName,
  } = imageRequestBody;
  const event = {
    eventType,
    eventName,
  };

  if (activeBrowsers.length === 0) {
    logger.logWarning('There are no browsers to compare.');
  }

  if (!activeBrowsers.includes(browser)) {
    logger.logWarning(`Inactive browser requested: ${browser}`);
    throw new Error(`Inactive browser requested: ${browser}`);
  }


  // Set waiting timeout for image from browser
  clearTimeout(timeoutMap[browser]);
  timeoutMap[browser] = setTimeout(() => {
    deactivateBrowser(browser, event, requestData);
  }, browserWaitingTime);


  if (!imageMap[id]) {
    imageMap[id] = {};
  }

  imageMap[id][browser] = {
    timestamp: imageRequestBody.timestamp ? parseInt(imageRequestBody.timestamp, 10) : new Date().getTime(),
    fileNames: requestData.fileNames,
  };
  await makeIdComparison(id, event, requestData.dateString);
};

module.exports.getEvents = () => events;
