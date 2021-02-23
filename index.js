// Custom `console.log` with timestamp prefix.
require('console-stamp')(console, '[HH:MM:ss.l]');

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

const streamPipeline = promisify(pipeline);

const OUTPUT_DIR = path.join('./output').normalize();
const MAIN_RESOURCES_URL = 'https://darkorbit-22.bpsecure.com/spacemap';
const RESOURCES_URLS = [
  'https://darkorbit-22.bpsecure.com/spacemap/xml/resources_3d.xml',
  'https://darkorbit-22.bpsecure.com/spacemap/xml/resources_3d_particles.xml',
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

  for (let i = 0; i < RESOURCES_URLS.length; i += 1) {
    const resourceUrl = RESOURCES_URLS[i];

    await fetch(resourceUrl)
      .then((response) => {
        if (response.ok) {
          return response.text();
        }

        throw new Error(`Unable to fetch XML resources from ${resourceUrl}`);
      })
      .then((xml) => xml2js.parseStringPromise(xml))
      .then((parsedXml) => {
        resources[i] = parsedXml;
      })
      .catch((err) => {
        console.error(err);
        console.log('Terminating process.');
        process.exit(0);
      });
  }

  return resources;
}

/**
 * Main run function.
 */
async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const resources = await fetchResources();
  const downloadLinks = generateDownloadLinks(resources).flat();

  console.log(`${downloadLinks.length} files to download.`);

  for (let i = 0; i < downloadLinks.length; i += 1) {
    await downloadFile(downloadLinks[i]);
  }
}

run();
