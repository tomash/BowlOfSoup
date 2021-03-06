import statuses from './constants/statusEnum';

const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const async = require('async');
const path = require('path');
// last page http://stanikus.soup.io/since/258895020
// after last page http://stanikus.soup.io/since/258894239?

// config
let soupUrl; // string
let mediaDirectory; // string

// const urlsListDirectory = path.resolve(__dirname, 'urlCollections');
// const urlListFilePath = path.resolve(
//   urlsListDirectory,
//   `urlList-${Date.now()}`
// );

// starting variables
let startEvent;
let q;
let pageCounter = 1;
let allMedia = [];
let downloadSuccess = 0;
let downloadFails = 0;
global.sharedObj = { shouldHaltDownloading: false };

function setUpWorkingDirectoryStructure() {
  if (!fs.existsSync(mediaDirectory)) {
    console.log(`Creating Directory: ${mediaDirectory}`);
    fs.mkdirSync(mediaDirectory);
  }
}

// function writeUrlListFile() {
// if (!fs.existsSync(urlsListDirectory)) {
//   console.log(`Creating Directory: ${urlsListDirectory}`);
//   fs.mkdirSync(urlsListDirectory);
// }
//   fs.writeFileSync(urlListFilePath, allMedia.join('\n'));
//   console.log('file saved');
// }

async function downloadFile(task) {
  if (global.sharedObj.shouldHaltDownloading) return null;
  try {
    const filePath = path.resolve(mediaDirectory, path.basename(task.url));

    // axios image download with response type "stream"
    const response = await axios({
      method: 'GET',
      url: task.url,
      responseType: 'stream'
    });

    // console.log(filePath.toString());
    // pipe the result stream into a file on disc
    await response.data.pipe(fs.createWriteStream(filePath));
    downloadSuccess += 1;

    startEvent.sender.send('downloadProgress', {
      successes: downloadSuccess,
      fails: downloadFails
    });
  } catch (e) {
    downloadFails += 1;
    console.error(e);
  }
}

function proceedElement(elem) {
  // console.log(elem);
  const url = elem.attribs.src;
  console.log(url);
  allMedia.push(url);
  // push a new line into the queue to be processed
  q.push({ url });
}

async function fetchUntilEnd(url) {
  let respond;

  if (global.sharedObj.shouldHaltDownloading) {
    q.kill();
    return statuses.HALTED;
  }
  try {
    respond = await axios.get(url, { timeout: 3 * 60 * 1000 });
    // const respond = await axios.get('http://stanikus.soup.io/since/258894239');
  } catch (e) {
    if (e.code === 'ETIMEDOUT') {
      throw Error(`Timeout fetching ${url}`);
    }
  }

  // todo there was an error that respond was undefined
  if (respond === undefined) {
    console.error('Respond from page tech was undefined');
    throw Error('Respond from page tech was undefined');
  }
  // todo what if respond isn't ok
  if (respond.statusText !== 'OK') {
    console.error(`Not OK server respond, status: ${respond.status}`);
    throw Error(`Not OK server respond, status: ${respond.status}`);
  }
  const $ = cheerio.load(respond.data);

  $('.imagecontainer img').each((i, elem) => proceedElement(elem));
  $('video').each((i, elem) => proceedElement(elem));

  const end = $('#new-future').children().length > 0;

  if (end) {
    console.log(`end of soup, this page is last: ${pageCounter}`);
    return statuses.FINISHED;
    // writeUrlListFile();
  }

  const newUrl = $('#load_more strong a')
    .prop('href')
    .split('?')[0];

  pageCounter += 1;
  console.log(`fetching page ${pageCounter}: ${soupUrl + newUrl}`);
  // console.log(soupUrl + newUrl);
  // eslint-disable-next-line no-return-await
  return await fetchUntilEnd(soupUrl + newUrl).catch(e => {
    throw e;
  });
}

export default function startDownloadingContent(
  username,
  downloadDirectory,
  parallelDownloads,
  event
) {
  try {
    soupUrl = `http://${username}.soup.io`;
    mediaDirectory = downloadDirectory;

    // reset starting variables
    pageCounter = 1;
    allMedia = [];
    downloadSuccess = 0;
    downloadFails = 0;
    global.sharedObj.shouldHaltDownloading = false;
    startEvent = event;
    q = async.queue(downloadFile, parallelDownloads);
    q.error((e, task) => {
      console.error('error in taks', task);
      console.error(e);
    });

    setUpWorkingDirectoryStructure();
    console.log('Fetching home page, page 1');
    fetchUntilEnd(soupUrl)
      .then(endStatus => {
        if (endStatus === statuses.FINISHED) {
          startEvent.sender.send('downloadFinished', {
            successes: downloadSuccess,
            fails: downloadFails
          });
        }
        if (endStatus === statuses.HALTED) {
          startEvent.sender.send('downloadHalted', {
            successes: downloadSuccess,
            fails: downloadFails
          });
        }
        return null;
      })
      .catch(error => {
        throw error;
      });
  } catch (e) {
    console.error(e);
    startEvent.sender.send('downloadFailed', {
      error: e.message,
      successes: downloadSuccess,
      fails: downloadFails
    });
  }
}
