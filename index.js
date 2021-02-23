const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

const OUTPUT_DIR = path.join('./output').normalize();

const MAIN_RESOURCES_URL = 'https://darkorbit-22.bpsecure.com/spacemap';
const RESOURCES_URLS = [
  'https://darkorbit-22.bpsecure.com/spacemap/xml/resources_3d.xml',
  'https://darkorbit-22.bpsecure.com/spacemap/xml/resources_3d_particles.xml',
];

function downloadFile(downloadLink) {
  const filePath = path.join(OUTPUT_DIR, '').normalize();
  const file = fs.createWriteStream();
}

function generateDownloadLinks(resources) {
  const downloadLinks = [];

  resources.forEach((resource, i) => {
    const locations = resource.filecollection.location.map((location) => ({ ...location.$ }));
    const files = resource.filecollection.file.map((file) => ({ ...file.$ }));
    
    const generatedDownloadLinks = files.map((file) => {
      const fileLocation = locations.find((location) => location.id == file.location);

      if (!fileLocation) {
        console.error(`Unable to find fileLocation of ${file.id}:${file.location}`);
        
        return null;
      }

      return `${MAIN_RESOURCES_URL}/${fileLocation.path}${file.name}.${file.type}`;
    });

    downloadLinks.push(generatedDownloadLinks);
  });

  return downloadLinks;
}

async function retrieveResources() {
  const resources = [];

  for (let i = 0; i < RESOURCES_URLS.length; i++) {
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

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const resources = await retrieveResources();
  const downloadLinks = generateDownloadLinks(resources);
  debugger;
}

(() => {
  run();
})();
