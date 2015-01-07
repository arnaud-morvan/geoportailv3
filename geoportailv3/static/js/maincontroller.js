goog.provide('app.MainController');

goog.require('app');
goog.require('app.GetWmtsLayer');
goog.require('ngeo.mapDirective');
goog.require('ol.Map');
goog.require('ol.View');
goog.require('ol.layer.Tile');
goog.require('ol.proj');
goog.require('ol.source.OSM');
goog.require('ol.source.WMTS');
goog.require('ol.tilegrid.WMTS');



/**
 * @param {angular.Scope} $scope Scope.
 * @param {angularGettext.Catalog} gettextCatalog Gettext catalog.
 * @param {string} langUrlTemplate Language URL template.
 * @param {app.GetWmtsLayer} appGetWmtsLayer Get WMTS layer function.
 * @constructor
 * @export
 * @ngInject
 */
app.MainController = function($scope, gettextCatalog, langUrlTemplate,
    appGetWmtsLayer) {

  /**
   * @type {angularGettext.Catalog}
   * @private
   */
  this.gettextCatalog_ = gettextCatalog;

  /**
   * @type {string}
   * @private
   */
  this.langUrlTemplate_ = langUrlTemplate;

  /**
   * @type {app.GetWmtsLayer}
   * @private
   */
  this.getWmtsLayer_ = appGetWmtsLayer;

  /**
   * @type {Boolean}
   */
  this['sidebarOpen'] = false;

  /**
   * @type {Boolean}
   */
  this['mymapsOpen'] = false;

  /**
   * @type {Boolean}
   */
  this['layersOpen'] = false;

  /**
   * @type {Boolean}
   */
  this['infosOpen'] = false;

  this.setMap_();
  this.switchLanguage('fr');
  this.manageSidebar_($scope);
};


/**
 * @private
 */
app.MainController.prototype.setMap_ = function() {

  /** @type {ol.Map} */
  this['map'] = new ol.Map({
    layers: [this.getWmtsLayer_('basemap_global')],
    view: new ol.View({
      center: ol.proj.transform([6, 49.7], 'EPSG:4326', 'EPSG:3857'),
      zoom: 8
    })
  });
};


/**
 * @param {string} lang Language code.
 * @export
 */
app.MainController.prototype.switchLanguage = function(lang) {
  this.gettextCatalog_.setCurrentLanguage(lang);
  this.gettextCatalog_.loadRemote(
      this.langUrlTemplate_.replace('__lang__', lang));
  this['lang'] = lang;
};


/**
 * @param {angular.Scope} scope Scope.
 * @private
 */
app.MainController.prototype.manageSidebar_ = function(scope) {

  var toggleSidebar = goog.bind(function(newVal, oldVal) {
    this['sidebarOpen'] = this['mymapsOpen'] || this['layersOpen'] ||
        this['infosOpen'];
  }, this);

  scope.$watch(goog.bind(function() {
    return this['mymapsOpen'];
  }, this), toggleSidebar);

  scope.$watch(goog.bind(function() {
    return this['layersOpen'];
  }, this), toggleSidebar);

  scope.$watch(goog.bind(function() {
    return this['infosOpen'];
  }, this), toggleSidebar);

  scope.$watch(goog.bind(function() {
    return this['sidebarOpen'];
  }, this), goog.bind(function(newVal, oldVal) {
    if (!newVal) {
      this['mymapsOpen'] = false;
      this['layersOpen'] = false;
      this['infosOpen'] = false;
    }
  }, this));
};


/**
 * @param {jQuery.event} $event Event.
 * @export
 */
app.MainController.prototype.showTab = function($event) {
  $event.preventDefault();
  $($event.target).tab('show');
};


app.module.controller('MainController', app.MainController);
