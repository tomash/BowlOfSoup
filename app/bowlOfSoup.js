const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const async = require('async');
const path = require('path');
// last page http://stanikus.soup.io/since/258895020
// after last page http://stanikus.soup.io/since/258894239?

// config

// const login = 'ulanaxy';
const login = 'stanikus';
let urlListFilePath = null;
const soupUrl = `http://${login}.soup.io`;
// const urlsListDirectory = './urlsListDirectory';
const urlsListDirectory = path.resolve(__dirname, 'urlCollections');
const mediaDirectory = path.resolve(__dirname, 'downloadedMedia');
const parallelDownloads = 10;

// starting variables
let pageCounter = 1;
const allMedia = [];
const q = async.queue(downloadFile, parallelDownloads);
setUpWorkingDirectoryStructure();

function setUpWorkingDirectoryStructure() {
  // console.log('saving file with all urls...');
  if (!fs.existsSync(urlsListDirectory)) {
    console.log(`Creating Directory: ${urlsListDirectory}`);
    fs.mkdirSync(urlsListDirectory);
  }

  if (!fs.existsSync(mediaDirectory)) {
    console.log(`Creating Directory: ${mediaDirectory}`);
    fs.mkdirSync(mediaDirectory);
  }

  urlListFilePath = path.resolve(urlsListDirectory, `urlList-${Date.now()}`);
}

function writeUrlListFile() {
  fs.writeFileSync(urlListFilePath, allMedia.join('\n'));
  console.log('file saved');
}

async function downloadFile(task) {
  const filePath = path.resolve(mediaDirectory, path.basename(task.url));

  // axios image download with response type "stream"
  const response = await axios({
    method: 'GET',
    url: task.url,
    responseType: 'stream'
  });

  // console.log(filePath.toString());
  // pipe the result stream into a file on disc
  response.data.pipe(fs.createWriteStream(filePath));
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
  const respond = await axios.get(url);
  // const respond = await axios.get('http://stanikus.soup.io/since/258894239');

  // console.log(respond);
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
    writeUrlListFile();
  } else {
    const newUrl = $('#load_more strong a')
      .prop('href')
      .split('?')[0];

    pageCounter += 1;
    console.log(`fetching page ${pageCounter}: ${soupUrl + newUrl}`);
    // console.log(soupUrl + newUrl);
    fetchUntilEnd(soupUrl + newUrl);
  }
}

function main() {
  console.log('Fetching home page, page 1');
  fetchUntilEnd(soupUrl);
}

main();