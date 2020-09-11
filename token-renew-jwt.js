import Router from 'next/router';

const { create } = require('apisauce');


const baseURL = process.env.HOST_URL || 'https://l0ger101.com';

const loginUrl = `${baseURL}/login`;
const refreshTokenUrl =`${baseURL}/refresh`;

let isPendingRefreshToken = false;
let failedQueue = [];
/**
 * keep failed request in qeue untile refresh tokn request resolve with new token
 * @param {*} error 
 * @param {*} token newtoken
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/* request new token */
const getAccessTokenWithRefreshToken = async function() {
  let accessToken;
  try {
    const refreshResponse = await fetch(refreshTokenUrl);
    const response = await refreshResponse.json();
    if (response.result && !response.result.error_description) {
      accessToken = response.result.access_token;
    }
    return accessToken;
  } catch (e) {
    return accessToken;
  } finally {
    isPendingRefreshToken = false;
  }
};

/* 
 Request config. 
 Get access token from request cookie header
*/
const request = (() => {
  const isBrowser = process.browser;
  let accessToken;
  if (isBrowser) {
    const WebCookies = Cookies.default;
    accessToken = new WebCookies().get('accessToken');
  }

  const headers = {
    platform: 'web',
    'Application-Name': 'ReactRevenue',
    'Content-Type': 'application/json',
    'Accept-Language': 'fa',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return create({
    baseURL,
    headers,
  });
})();

const mustGetRefreshToken = response => {
  return (
    response.status === 401 &&
    response.config &&
    !response.config.isRetryRequest
  );
};

/* 
   Retray failed requests with new access token.
   if refresh token expired redirect user to login page 
*/
const retrayRequest = async (originalRequest, newToken) => {
  try {
    const { method, url, data } = originalRequest;

    if (newToken) {
      if (method === 'post' || method === 'put') {
        return await request[method](url, data);
      }
      return await request[method](url);
    }
    return Router.push(loginUrl);
  } catch (e) {
    await Router.push(loginUrl);
  }
};

/* 
  check reponse status. if token expired request new token and 
  put all failed request into qeue until new token resolve 
*/
request.addAsyncResponseTransform(async response => {
  if (mustGetRefreshToken(response)) {
    const originalRequest = response.config;
    if (isPendingRefreshToken) {
      return new Promise(function(resolve, reject) {
        failedQueue.push({ resolve, reject });
      })
        .then(async newToken => {
          originalRequest.isRetryRequest = true;
          const newResponse = await retrayRequest(originalRequest, newToken);
          response.data = newResponse.data;
          response.status = 200;
          response.ok = true;
        })
        .catch(err => {
          return Promise.reject(err);
        });
    }

    isPendingRefreshToken = true;
    const newToken = await getAccessTokenWithRefreshToken();
    request.addRequestTransform(apiReq => {
      apiReq.headers.Authorization = `Bearer ${newToken}`;
      apiReq.headers.Context = 'MehdiGeran';
    });
    processQueue(null, newToken);
    const newResponse = await retrayRequest(originalRequest, newToken);
    response.data = newResponse.data;
    response.status = 200;
    response.ok = true;
  }
});

/** set access token for all request */
const serverRequestModifier = req => {
  const cookies = new Cookies(req.headers.cookie);
  const accessToken = cookies.get('accessToken');
  const authorization = accessToken ? `Bearer ${accessToken}` : null; 
  if (authorization) {
    request.setHeader('Authorization', authorization);
  }
  request.setHeader('Context', cookies.application_name || 'MehdiGeran');
};

 
module.exports = {
  request,
  baseURL,
  mainUrl,
  serverRequestModifier,
};
