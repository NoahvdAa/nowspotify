const axios = require('axios').default;
const express = require('express');
const qs = require('qs');
const ws = require('ws');

const app = express();

const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const SPOTIFY_OAUTH_AUTH = process.env.SPOTIFY_OAUTH_AUTH;
const UPDATE_INTERVAL = process.env.UPDATE_INTERVAL || 5000;
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));
const wsServer = new ws.Server({ server, path: '/realtime' });

let dataLastUpdated = 0;
let cachedData;
let isFetchingData = false;
let accessToken;

app.get('/data', async (req, res) => {
    await fetchDataIfNecessary();
    res.json(cachedData);
});

wsServer.on('connection', async (ws) => {
    await fetchDataIfNecessary();
    ws.focused = true;

    ws.on('message', async (data) => {
        const msg = data.toString();

        if (msg === 'focused') {
            ws.focused = true;
            await fetchDataIfNecessary();
        } else if (msg === 'unfocused') {
            ws.focused = false;
        }
    });
});

const fetchDataIfNecessary = async (tolerance = 0) => {
    if (dataLastUpdated + UPDATE_INTERVAL - tolerance >= Date.now()) return;

    await fetchData();
};

const fetchData = async () => {
    if (isFetchingData) return;

    isFetchingData = true;
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        isFetchingData = false;
        dataLastUpdated = Date.now();

        cachedData = response.data;
        wsServer.clients.forEach((ws) => ws.send(JSON.stringify(response.data)));
    } catch (e) {
        isFetchingData = false;
        return console.error('Got error response from Spotify:', e);
    }
};

const authenticate = async () => {
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', qs.stringify({
            grant_type: 'refresh_token',
            refresh_token: REFRESH_TOKEN
        }), {
            headers: {
                Authorization: `Basic ${SPOTIFY_OAUTH_AUTH}`
            }
        });
        accessToken = response.data.access_token;
        setTimeout(async () => await authenticate(), (response.data.expires_in * 1000) - 15000); // Refresh in time
    } catch (e) {
        return console.error('Got error response from Spotify when authenticating:', e);
    }
};

setInterval(async () => {
    if (Array.from(wsServer.clients).filter((ws) => ws.focused).length === 0) return;
    await fetchDataIfNecessary(500);
}, UPDATE_INTERVAL);

authenticate();
