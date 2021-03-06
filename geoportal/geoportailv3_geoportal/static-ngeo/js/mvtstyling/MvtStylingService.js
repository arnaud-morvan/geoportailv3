import appModule from '../module.js';

function hasLocalStorage() {
    return 'localStorage' in window && localStorage;
}

const url_get = '/get_userconfig';
const url_save = '/save_userconfig';
const url_delete = '/delete_userconfig';
const url_config_mvt = '/apply_mvt_config'
const ls_ = window.localStorage;
const LS_KEY_EXPERT = 'expertStyling';
const LS_KEY_MEDIUM = 'mediumStyling';

function getDefaultMapBoxStyleUrl() {
  const searchParams = new URLSearchParams(document.location.search);
  const server = searchParams.get('embeddedserver');
  const proto = searchParams.get('embeddedserverprotocol') || 'http';
  const url = (server ? `${proto}://${server}` : 'https://vectortiles.geoportail.lu') + '/styles/roadmap/style.json';
  return url;
}
export const defaultMapBoxStyle = getDefaultMapBoxStyleUrl();
export const defaultMapBoxStyleXYZ = 'https://vectortiles.geoportail.lu/styles/roadmap/{z}/{x}/{y}.png';



class MvtStylingService {
  /**
   * @param {angular.$http} $http Angular http service.
   * @param {app.UserManager} appUserManager User manager service.
   * @param {String} uploadvtstyleUrl URL to provision a style
   * @param {String} deletevtstyleUrl URL to delete a provisionned style
   * @param {String} getvtstyleUrl URL to get a provisionned style
   * @param {ngeo.map.BackgroundLayerMgr} ngeoBackgroundLayerMgr Background layer
   * @param {ngeo.statemanager.Location} ngeoLocation ngeo location service.
   * @ngInject
   */
  constructor($http, appUserManager, uploadvtstyleUrl, deletevtstyleUrl, getvtstyleUrl, ngeoBackgroundLayerMgr, ngeoLocation) {
    this.http_ = $http;
    this.appUserManager_ = appUserManager;
    this.isCustomStyle = false;
    this.uploadvtstyleUrl_ = uploadvtstyleUrl;
    this.deletevtstyleUrl_ = deletevtstyleUrl;
    this.getvtstyleUrl_ = getvtstyleUrl;
    this.backgroundLayerMgr_ = ngeoBackgroundLayerMgr;
    this.ngeoLocation_ = ngeoLocation;
  }

  getBgStyle() {
    const label = 'basemap_2015_global';
    const itemKey = this.createRemoteItemKey_(label);
    let remoteId = this.getLS_(itemKey);
    const xyz_custom = remoteId ? this.createXYZCustom_(remoteId) : undefined;


    const serial = new URLSearchParams(window.location.search).get('serial');
    const config = {
      label,
      defaultMapBoxStyle,
      defaultMapBoxStyleXYZ,
      xyz: xyz_custom || defaultMapBoxStyleXYZ,
      xyz_custom,
      style: defaultMapBoxStyle
    };
    if (serial) {
        // if serial is number id, retrieve style form it
        const isValidUUIDv4Regex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/gi;
        if (serial.match(isValidUUIDv4Regex) !== null) {
            console.log('Load mvt style from serial uuid');
            this.isCustomStyle = true;
            const style_url = `${this.getvtstyleUrl_}?id=${serial}`
            config.style = style_url;
            return Promise.resolve(config);
        } else {
            console.log('Load mvt style from serialized config');
            this.isCustomStyle = true;
            config.style = this.apply_mvt_config(serial);
            return Promise.resolve(config);
        }
    } else if (this.appUserManager_.isAuthenticated()) {
        // TODO getDB avec style medium ???
        return this.getDB_(LS_KEY_EXPERT).then(resultFromDB => {
            if (resultFromDB.data.length > 0) {
                console.log('Load mvt expert style from database and save it to local storage');
                this.isCustomStyle = true;
                this.saveLS_(LS_KEY_EXPERT, resultFromDB.data[0].value);
                config.style = JSON.parse(resultFromDB.data[0].value)
                return config;
            } else {
                // Default style if no existing in LS or DB
                console.log('Default mvt style loaded');
                this.isCustomStyle = false;
                return config;
            }
        });
    } else if (hasLocalStorage() && this.hasLS_(itemKey)) {
        // If there is a mvt expert style in the local storage, force parameter in the url
        this.ngeoLocation_.updateParams({
            'serial': remoteId
        });
        console.log('Load mvt expert style from local storage');
        this.isCustomStyle = true;
        config.customStyle = this.isCustomStyle;
        config.style = JSON.parse(this.getLS_(LS_KEY_EXPERT));
        return Promise.resolve(config);
    } else if (hasLocalStorage() && this.hasLS_(LS_KEY_MEDIUM)) {
        // If there is a mvt medium config in the local storage, force parameter in the url
        this.ngeoLocation_.updateParams({
            'serial': this.getLS_(LS_KEY_MEDIUM)
        });
        console.log('Load mvt medium style from local storage');
        this.isCustomStyle = true;
        config.customStyle = this.isCustomStyle;

        // Should work offline as well
        config.style = JSON.parse(this.getLS_(LS_KEY_EXPERT));
        return Promise.resolve(config);
    } else {
        // Default style if no existing in LS or DB
        console.log('Default mvt style loaded');
        this.isCustomStyle = false;
        return Promise.resolve(config);
    }
}

createXYZCustom_(id) {
  return `https://vectortiles.geoportail.lu/styles/${id}/{z}/{x}/{y}.png`;
}

createRemoteItemKey_(label) {
  return 'remoteIdForStyle_' + label;
}

publishIfSerial(map) {
    const serial = new URLSearchParams(window.location.search).get('serial');
    const isValidUUIDv4Regex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/gi;
    if (serial) {
        // check if simple/medium styling
        if (serial.match(isValidUUIDv4Regex) === null) {
            const bgLayer = this.backgroundLayerMgr_.get(map);
            const mbMap =  bgLayer.getMapBoxMap();
            const interval = setInterval(() => {
                try {
                    const data = JSON.stringify(mbMap.getStyle());
                    clearInterval(interval);
                    this.publishStyle(bgLayer, data).then(() => {
                      // for OL-Cesium to refresh the background layer counterpart
                      // and thus request tiles with custom style
                      this.backgroundLayerMgr_.set(map, bgLayer);
                    });
                } catch (error) {
                    console.log(error);
                    return;
                }
            }, 50);
        }
    }
}

unpublishIfSerial(map) {
    const serial = new URLSearchParams(window.location.search).get('serial');
    const isValidUUIDv4Regex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/gi;
    if (serial) {
        // check if simple/medium styling
        if (serial.match(isValidUUIDv4Regex) === null) {
            const bgLayer = this.backgroundLayerMgr_.get(map);
            if (!bgLayer) { // 3D enable watch is run before bgLayer is initialized...
                return;
            }
            return this.unpublishStyle(bgLayer);
        }
    }
}


publishStyle(layer, data) {
  const label = layer.get('label');

  return this.unpublishStyle(layer).then(() => {
    const formData = new FormData();
    const blob = new Blob([data], {type: "application/json"});
    formData.append('style', blob, 'style.json');
    const options = {
      method: 'POST',
      body: formData,
    };
    return fetch(this.uploadvtstyleUrl_, options)
      .then(response => response.json())
      .then(result => {
        this.saveLS_(this.createRemoteItemKey_(label), result.id);
        layer.set('xyz_custom', this.createXYZCustom_(result.id));
        return result.id;
      });
  });
}

unpublishStyle(layer) {
  const label = layer.get('label');
  const itemKey = this.createRemoteItemKey_(label);
  let id = this.getLS_(itemKey);

  if (id) {
    this.deleteLS_(this.createRemoteItemKey_(label));
    const url = `${this.deletevtstyleUrl_}?id=${id}`;
    layer.unset('xyz_custom');
    return fetch(url).catch(() => '');
  }
  return Promise.resolve();
}

saveBgStyle(layer, isPublished) {
    const mbMap =  layer.getMapBoxMap();
    const data = JSON.stringify(mbMap.getStyle());
    const promises = [];
    if (this.appUserManager_.isAuthenticated()) {
      console.log('Saving expert style in database');
      promises.push(this.saveDB_(LS_KEY_EXPERT, data));
    }
    this.isCustomStyle = true;
    this.saveLS_(LS_KEY_EXPERT, data);
    console.log('Expert style saved in local storage');

    if (isPublished) {
        promises.push(this.publishStyle(layer, data));
    } else  {
        // Remove unused remoteIdForStyle{layer} key stored in ls
        promises.push(this.unpublishStyle(layer));
    }

    return Promise.all(promises);
}

getMediumStyle() {
    if (this.appUserManager_.isAuthenticated()) {
        return this.getDB_(LS_KEY_MEDIUM).then(resultFromDB => {
            const styleFromDB = resultFromDB.data;
            if (styleFromDB.length > 0) {
                console.log('Load mvt medium config from database and save it to local storage');
                this.isCustomStyle = true;
                this.saveLS_(LS_KEY_MEDIUM, styleFromDB[0].value);
                return styleFromDB[0].value;
            }
        });
    } else if (hasLocalStorage() && this.hasLS_(LS_KEY_MEDIUM)) {
        console.log('Load mvt medium config from local storage');
        return Promise.resolve(this.getLS_(LS_KEY_MEDIUM));
    }
}

removeMediumStyle() {
    if (this.appUserManager_.isAuthenticated()) {
        console.log('Removed mvt medium config from database');
        return this.deleteDB_(LS_KEY_MEDIUM);
    }
    console.log('Removed mvt medium config from local storage');
    return this.deleteLS_(LS_KEY_MEDIUM);
}

getUrlVtStyle(layer) {
  const label = layer.get('label');
  const itemKey = this.createRemoteItemKey_(label);
  let id = this.getLS_(itemKey);

  if (id == null) return defaultMapBoxStyle;
  return this.getvtstyleUrl_ + '?id=' + id;
}

saveMediumStyle(config) {
    const promises = [];
    this.isCustomStyle = true;
    if (this.appUserManager_.isAuthenticated()) {
        promises.push(this.saveDB_(LS_KEY_MEDIUM, config));
        console.log('Medium config saved in database');
    }
    this.saveLS_(LS_KEY_MEDIUM, config);
    console.log('Medium config saved in local storage');

    return Promise.all(promises);
}

removeStyles(layer) {
    this.deleteLS_(LS_KEY_EXPERT);
    this.deleteLS_(LS_KEY_MEDIUM);
    const promises = [];
    promises.push(this.unpublishStyle(layer));
    console.log('Removed mvt styles from local storage');
    if (this.appUserManager_.isAuthenticated()) {
        promises.push(this.deleteDB_(LS_KEY_EXPERT));
        promises.push(this.deleteDB_(LS_KEY_MEDIUM));
        console.log('Removed mvt styles from database');
    }
    this.isCustomStyle = false;
    return Promise.all(promises);
}

apply_mvt_config(mvt_config) {
    const url = new URL(window.location);
    let params = new URLSearchParams();
    params.set('config', JSON.stringify(mvt_config));
    params.set('style_url', defaultMapBoxStyle);
    return `${url.origin}${url_config_mvt}?${params.toString()}`;
}

// Local Storage methods
/**
 * @private
 */
getLS_(key) {
    return ls_.getItem(key);
}

/**
 * @private
 */
saveLS_(key, value) {
    return ls_.setItem(key, value);
}

/**
 * @private
 */
deleteLS_(key) {
    return ls_.removeItem(key);
}

/**
 * @private
 */
hasLS_(key) {
    return !!ls_.getItem(key);
}


// Database methods
/**
 * @private
 */
getDB_(key) {
    return this.http_.get(url_get + "?key=" + key);
}

/**
 * @private
 */
saveDB_(key, value) {
    const config = {
        headers: {'Content-Type': 'application/json'}
      };
    const data = {
        key,
        value
    };
    return this.http_.post(url_save, data, config);
}

/**
 * @private
 */
deleteDB_(key) {
    return this.http_.delete(url_delete + "?key=" + key);
  }
}

appModule.service('appMvtStylingService', MvtStylingService);

export default MvtStylingService;
