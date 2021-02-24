// Custom `console.log` with timestamp prefix.
require('console-stamp')(console, '[HH:MM:ss.l]');

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const inquirer = require('inquirer');

const streamPipeline = promisify(pipeline);

const OUTPUT_DIR = path.join('./output').normalize();
const MAIN_RESOURCES_URL = 'https://darkorbit-22.bpsecure.com/spacemap';
const RESOURCES_URLS = [
  {
    name: 'RESOURCES_3D',
    url: 'https://darkorbit-22.bpsecure.com/spacemap/xml/resources_3d.xml',
  },
  {
    name: 'RESOURCES_3D_PARTICLES',
    url: 'https://darkorbit-22.bpsecure.com/spacemap/xml/resources_3d_particles.xml',
  },
  {
    name: 'RESOURCES',
    url: 'https://darkorbit-22.bpsecure.com/spacemap/xml/resources.xml',
  },
];

/**
 * Create a write-stream to the item file path.
 *
 * @param {Object} item Item to download.
 */
async function downloadFile(item) {
  const directoryPath = path.join(OUTPUT_DIR, item.location.path).normalize();
  const filePath = path.join(directoryPath, item.name);

  // Make sure to create sub-directories in case they doesn't exist.
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  const response = await fetch(item.link);

  if (!response.ok) {
    console.error(`Unexpected response from ${item.link} - ${response.status}`);
  } else {
    await streamPipeline(response.body, fs.createWriteStream(filePath));
    console.log(`Downloaded: ${item.link}`);
  }
}

/**
 * Generate download links for each items of every resources XMLs.
 *
 * @param {Array} resources
 * @returns {Array}
 */
function generateDownloadLinks(resources) {
  const downloadLinks = [];

  resources.forEach((resource) => {
    const locations = resource.filecollection.location.map((location) => ({ ...location.$ }));
    const files = resource.filecollection.file.map((file) => ({ ...file.$ }));

    const resourceDownloadLinks = files.map((file) => {
      const fileLocation = locations.find((location) => location.id === file.location);

      if (!fileLocation) {
        console.error(`Unable to find fileLocation of ${file.id}: ${file.location}`);
        return null;
      }

      return {
        location: fileLocation,
        name: `${file.name}.${file.type}`,
        link: `${MAIN_RESOURCES_URL}/${fileLocation.path}${file.name}.${file.type}`,
      };
    })
      // Remove items that are not objects when no fileLocation have been found
      // for some items.
      .filter((downloadLink) => !!downloadLink);

    downloadLinks.push(resourceDownloadLinks);
  });

  return downloadLinks;
}

/**
 * Fetch resources XML files.
 *
 * @returns {Promise<Array>}
 */
async function fetchResources() {
  const resources = [];

  const promises = RESOURCES_URLS.map(({ name, url }, i) => fetch(url)
    .then((response) => {
      if (response.ok) {
        return response.text();
      }

      throw new Error(`Unable to fetch XML resources from ${name}: ${url}`);
    })
    .then((xml) => xml2js.parseStringPromise(xml))
    .then((parsedXml) => {
      resources[i] = parsedXml;
    }));

  await Promise.all(promises).catch((err) => {
    console.error(err);
    process.exit(0);
  });

  return resources;
}

/**
 * Prompt resources to download.
 *
 * @param {Array} resources
 * @returns {Array}
 */
async function promptResourcesToDownload(resources) {
  const itemsToDownload = [];

  const answers = await inquirer.prompt(
    [
      {
        type: 'checkbox',
        name: 'resources',
        message: 'What type of resource do you want to download?',
        choices: RESOURCES_URLS.map(({ name }) => name),
        validate: (answer) => (answer.length < 1 ? 'You must choose at least 1 item.' : true),
      },
    ],
  );

  answers.resources.forEach((name) => {
    const index = RESOURCES_URLS.findIndex((RESOURCE_URL) => RESOURCE_URL.name === name);

    itemsToDownload.push(resources[index]);
  });

  return itemsToDownload;
}

/**
 * Main run function.
 */
async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const resources = await fetchResources();
  const resourceTypes = await promptResourcesToDownload(resources);
  const downloadLinks = generateDownloadLinks(resourceTypes).flat();

  console.log(`${downloadLinks.length} files to download.`);

  for (let i = 0; i < downloadLinks.length; i += 1) {
    await downloadFile(downloadLinks[i]);
  }
}

run();
