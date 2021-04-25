import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { S3 } from '@aws-sdk/client-s3';
import { S3Event, S3Handler } from 'aws-lambda';

type env = {
  DESTINATION_BUCKET: string;
  FFMPEG_ARGS: string;
  MIME_TYPES: string;
  VIDEO_MAX_DURATION: string;
  ENDPOINT_URL?: string;
};

const {
  DESTINATION_BUCKET,
  FFMPEG_ARGS,
  MIME_TYPES,
  VIDEO_MAX_DURATION,
  ENDPOINT_URL,
} = process.env as env;

const opts = ENDPOINT_URL ? { endpoint: ENDPOINT_URL } : {};

const s3 = new S3(opts);

const tempDir = process.env['TEMP'] || os.tmpdir();
const download = path.join(tempDir, 'download');

/**
 * Creates a readable stream from an S3 Object reference
 */
async function downloadFile(Bucket: string, Key: string) {
  const contents = await s3.getObject({ Bucket, Key });

  fs.writeFileSync(download, contents.Body);
}

/**
 * Normalizes the location of a cloud storage object for S3
 */
export function getFileLocation({
  Records: [
    {
      s3: { bucket, object },
    },
  ],
}: S3Event): { bucket: string; key: string } {
  return {
    bucket: bucket.name,
    key: decodeURIComponent(object.key).replace(/\+/g, ' '),
  };
}

export function checkM3u(file: string) {
  const fileContents = fs.readFileSync(file).toString();

  if (/^#EXT/g.test(fileContents)) {
    throw new Error('File looks like an M3U, bailing out');
  }
}

const extensionRegex = /\.(\w+)$/;

function getExtension(filename: string) {
  return filename.match(extensionRegex)![1];
}

const outputDir = path.join(tempDir, 'outputs');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const mimeTypes = JSON.parse(MIME_TYPES);
const videoMaxDuration = +VIDEO_MAX_DURATION;

/**
 * Runs FFprobe and ensures that the input file has a valid stream and meets the maximum duration threshold.
 */
async function ffprobe(): Promise<void> {
  console.log('Starting FFprobe');

  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-i',
      'download',
    ];
    const opts = {
      cwd: os.tmpdir(),
    };
    const cb = (error: string | null, stdout: string) => {
      if (error) {
        reject(error);
      }

      console.log(stdout);

      const { streams, format } = JSON.parse(stdout);

      const hasVideoStream = streams.some(
        ({ codec_type, duration }: { codec_type: string; duration: number }) =>
          codec_type === 'video' &&
          (duration || format.duration) <= videoMaxDuration,
      );

      if (!hasVideoStream) {
        reject('FFprobe: no valid video stream found');
      } else {
        console.log('Valid video stream found. FFprobe finished.');
        resolve();
      }
    };

    child_process
      .execFile('ffprobe', args, opts)
      .on('error', reject)
      .on('close', cb);
  });
}

/**
 * Runs the FFmpeg executable
 *
 * @param {string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
function ffmpeg(keyPrefix: string): Promise<void> {
  console.log('Starting FFmpeg');

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-loglevel',
      'warning',
      '-i',
      '../download',
      ...FFMPEG_ARGS.replace('$KEY_PREFIX', keyPrefix).split(' '),
    ];
    const opts = {
      cwd: outputDir,
    };

    child_process
      .spawn('ffmpeg', args, opts)
      .on('message', (msg) => console.log(msg))
      .on('error', reject)
      .on('close', resolve);
  });
}

/**
 * Deletes a file
 *
 * @param {!string} localFilePath - The location of the local file
 */
function removeFile(localFilePath: string) {
  console.log(`Deleting ${localFilePath}`);

  fs.unlinkSync(localFilePath);
}

/**
 * Transforms, uploads, and deletes an output file
 */
async function uploadFile(keyPrefix: string, filename: string) {
  const extension = getExtension(filename);
  const mimeType = mimeTypes[extension];
  const fileFullPath = path.join(outputDir, filename);
  const rmFiles = [fileFullPath];

  console.log(`Uploading ${mimeType}`);

  await s3.putObject({
    Bucket: DESTINATION_BUCKET,
    Key: `${keyPrefix}.${extension}`,
    Body: fs.readFileSync(fileFullPath).toString(),
    ContentType: mimeType,
    CacheControl: 'max-age=31536000',
  });

  console.log(`${mimeType} ${filename} complete.`);

  rmFiles.forEach(removeFile);
}

/**
 * Uploads the output files
 */
async function uploadFiles(keyPrefix: string) {
  return Promise.all(
    fs
      .readdirSync(outputDir)
      .map((filename) => uploadFile(keyPrefix, filename)),
  );
}

/**
 * The Lambda Function handler
 */
export const handler: S3Handler = async (event) => {
  const sourceLocation = getFileLocation(event);
  const keyPrefix = sourceLocation.key.replace(/\.[^/.]+$/, '');

  const s3Record = event.Records[0].s3;

  await downloadFile(s3Record.bucket.name, s3Record.object.key);
  checkM3u(download);
  await ffprobe();
  await ffmpeg(keyPrefix);
  removeFile(download);
  await Promise.all([uploadFiles(keyPrefix)]);
};
