import minimist from 'minimist';
import deepstream from 'deepstream.io-client-js';
import R from 'ramda';
import _ from 'lodash';
import Radio from './radio';
import Queue from './queue';

async function main(argv) {
    const dsClient = deepstream(process.env.DEEPSTREAM_HOST_PORT).login({
        username: process.env.DEEPSTREAM_USERNAME,
        password: process.env.DEEPSTREAM_PASSWORD
    });

    const radio = new Radio({
        useAWGN: argv.useAwgn
    });
    radio.out.pipe(process.stdout);

    const queue = new Queue(radio);

    dsClient.event.subscribe('queue', data => {
        switch(data.action) {
            case 'add': queue.queueUrl(data.url); break;
            case 'next': queue.next(); break;
        }
    });

    const songStateRecord = dsClient.record.getRecord('song-state');
    const setSongStatePath = R.curryN(2, ::songStateRecord.set);

    songStateRecord.whenReady(() => {
        const data = songStateRecord.get();

        // if(data.currentSong != null) {
        //     queue.queueUrl(data.currentSong);
        // }

        if(_.isArray(data.queue)) {
            data.queue.forEach(::queue.queueUrl);
        }

        setSongStatePath({ currentSong: null, queue: queue.queue, ...data });

        queue.on('queue-changed', setSongStatePath('queue'));
        radio.on('song-end', () => setSongStatePath('currentSong', null));
        radio.on('song-start', setSongStatePath('currentSong'));

        radio.on('song-end', (url, stream, manual) => console.error('SONG ENDED:', url, 'MANUALLY?', manual));
        radio.on('song-start', (url) => console.error('NOW PLAYING:', url));
    });
}

main(
    minimist(process.argv.slice(2), {
        boolean: ['useAwgn'],
        alias: {
            useAwgn: 'w'
        }
    })
)
.catch((err) => console.error(err.stack));
