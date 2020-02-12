#!/bin/bash -e

set -x

mkdir -p /app/geoportailv3_geoportal/jsapi/build/fonts
mkdir -p /app/geoportailv3_geoportal/jsapi/webfonts
cp node_modules/font-awesome/fonts/* /app/geoportailv3_geoportal/jsapi/build/fonts/
cp node_modules/font-awesome/fonts/* /app/geoportailv3_geoportal/jsapi/webfonts/
cp /app/geoportailv3_geoportal/static-ngeo/webfonts/*.* /app/geoportailv3_geoportal/jsapi/build/fonts/
cp /app/geoportailv3_geoportal/static-ngeo/webfonts/*.* /app/geoportailv3_geoportal/jsapi/webfonts/
node node_modules/openlayers/tasks/build.js /app/apiv3/jsapi/config.json apiv3.js
cat node_modules/proj4/dist/proj4.js node_modules/whatwg-fetch/fetch.js node_modules/d3/build/d3.min.js \
node_modules/js-autocomplete/auto-complete.min.js \
node_modules/promise-polyfill/promise.min.js \
node_modules/url-polyfill/url-polyfill.min.js \
apiv3.js > concatenated.js
mv concatenated.js /app/geoportailv3_geoportal/static-ngeo/build/apiv3.js
./node_modules/.bin/lessc --clean-css /app/apiv3/jsapi/less/geoportailv3.api.less /app/geoportailv3_geoportal/static-ngeo/build/apiv3.css
node /app/apiv3/jsapi/jsdoc/get-ol3-doc-ref.js > /app/apiv3/.build/jsdocOl3.js

node node_modules/.bin/jsdoc /app/apiv3/jsapi/jsdoc/api/index.md -c /app/apiv3/jsapi/jsdoc/api/conf.json  -d /app/geoportailv3_geoportal/jsapi/build/apidoc
cp -R /app/apiv3/jsapi/examples /app/geoportailv3_geoportal/jsapi/build/apidoc/

