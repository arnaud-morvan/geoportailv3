goog.provide('app.Measure');
goog.provide('app.MeasureEvent');
goog.provide('app.MeasureEventType');

goog.require('goog.asserts');
goog.require('goog.dom');
goog.require('goog.dom.classlist');
goog.require('goog.events');
goog.require('ol.Feature');
goog.require('ol.MapBrowserEvent');
goog.require('ol.Overlay');
goog.require('ol.interaction.DrawEvent');
goog.require('ol.interaction.DrawEventType');
goog.require('ol.interaction.Interaction');
goog.require('ol.layer.Vector');
goog.require('ol.source.Vector');
goog.require('ol.style.Fill');
goog.require('ol.style.Stroke');
goog.require('ol.style.Style');


/**
 * Interactions for measure tools base class.
 * @typedef {{
 *    startMsg: (Element|undefined),
 *    style:(ol.style.Style|Array.<ol.style.Style>|ol.style.StyleFunction|undefined)
 * }}
 */
app.MeasureBaseOptions;


/**
 * @enum {string}
 */
app.MeasureEventType = {
  /**
   * Triggered upon feature draw end
   * @event app.MeasureEvent#measureend
   */
  MEASUREEND: 'measureend',
  MODIFYMEASUREEND: 'modifymeasureend'
};



/**
 * @classdesc
 * Events emitted by {@link ngeo.interaction.Interaction} instances are
 * instances of this type.
 *
 * @constructor
 * @extends {goog.events.Event}
 * @implements {ngeox.MeasureEvent}
 * @param {app.MeasureEventType} type Type.
 * @param {ol.Feature} feature The feature drawn.
 */
app.MeasureEvent = function(type, feature) {

  goog.base(this, type);

  /**
   * The feature being drawn.
   * @type {ol.Feature}
   * @api stable
   */
  this.feature = feature;

};
goog.inherits(app.MeasureEvent, goog.events.Event);



/**
 * Interaction that allows measuring (length, area, ...).
 *
 * @constructor
 * @extends {ol.interaction.Interaction}
 * @param {app.MeasureBaseOptions=} opt_options Options
 */
app.Measure = function(opt_options) {

  var options = goog.isDef(opt_options) ? opt_options : {};

  goog.base(this, {
    handleEvent: app.Measure.handleEvent_
  });

  /**
   * Is creating a new feature or modifying an existing one.
   * @type {boolean}
   */
  this.modifyMode = false;

  /**
   * The help tooltip element.
   * @type {Element}
   * @private
   */
  this.helpTooltipElement_ = null;


  /**
   * Overlay to show the help messages.
   * @type {ol.Overlay}
   * @private
   */
  this.helpTooltipOverlay_ = null;


  /**
   * The measure tooltip element.
   * @type {Element}
   * @private
   */
  this.measureTooltipElement_ = null;


  /**
   * Overlay to show the measurement.
   * @type {ol.Overlay}
   * @private
   */
  this.measureTooltipOverlay_ = null;


  /**
   * The sketch feature.
   * @type {ol.Feature}
   * @protected
   */
  this.sketchFeature = null;

  /**
   * Message to show after the first point is clicked.
   * @type {?Element}
   */
  this.continueMsg = null;

  /**
   * The message to show when user is about to start drawing.
   * @type {Element}
   */
  this.startMsg = goog.isDef(options.startMsg) ? options.startMsg :
      goog.dom.createDom(goog.dom.TagName.SPAN, {}, 'Click to start drawing.');

  /**
   * The key for geometry change event.
   * @type {?goog.events.Key}
   * @private
   */
  this.changeEventKey_ = null;

  var style = goog.isDef(options.style) ? options.style :
      [
        new ol.style.Style({
          fill: new ol.style.Fill({
            color: 'rgba(255, 255, 255, 0.2)'
          })
        }),
        new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: 'white',
            width: 5
          })
        }),
        new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: '#ffcc33',
            width: 3
          })
        })
      ];

  /**
   * The vector layer used to show final measure features.
   * @type {ol.layer.Vector}
   * @private
   */
  this.vectorLayer_ = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: style
  });

  /**
   * The draw interaction to be used.
   * @type {ol.interaction.Draw|ngeo.interaction.DrawAzimut}
   * @private
   */
  this.drawInteraction_ = this.getDrawInteraction(options.sketchStyle,
      this.vectorLayer_.getSource());

  goog.events.listen(this.drawInteraction_,
      ol.interaction.DrawEventType.DRAWSTART, this.onDrawStart_, false, this);
  goog.events.listen(this.drawInteraction_,
      ol.interaction.DrawEventType.DRAWEND, this.onDrawEnd_, false, this);

  goog.events.listen(this,
      ol.Object.getChangeEventType(ol.interaction.InteractionProperty.ACTIVE),
      this.updateState_, false, this);
};
goog.inherits(app.Measure, ol.interaction.Interaction);


/**
 * Calculate the area of the passed polygon and return a formatted string
 * of the area.
 * @param {ol.geom.Polygon} polygon Polygon.
 * @param {ol.proj.Projection} projection Projection of the polygon coords.
 * @return {string} Formatted string of the area.
 */
app.Measure.getFormattedArea = function(polygon, projection) {
  var geom = /** @type {ol.geom.Polygon} */ (
      polygon.clone().transform(projection, 'EPSG:4326'));
  var coordinates = geom.getLinearRing(0).getCoordinates();
  var area = Math.abs(ol.sphere.WGS84.geodesicArea(coordinates));
  var output;
  if (area > 1000000) {
    output = parseFloat((area / 1000000).toPrecision(3)) +
        ' ' + 'km<sup>2</sup>';
  } else {
    output = parseFloat(area.toPrecision(3)) + ' ' + 'm<sup>2</sup>';
  }
  return output;
};


/**
 * Calculate the length of the passed line string and return a formatted
 * string of the length.
 * @param {ol.geom.LineString} lineString Line string.
 * @param {ol.proj.Projection} projection Projection of the line string coords.
 * @return {string} Formatted string of length.
 */
app.Measure.getFormattedLength =
    function(lineString, projection) {
  var length = 0;
  var coordinates = lineString.getCoordinates();
  for (var i = 0, ii = coordinates.length - 1; i < ii; ++i) {
    var c1 = ol.proj.transform(coordinates[i], projection, 'EPSG:4326');
    var c2 = ol.proj.transform(coordinates[i + 1], projection, 'EPSG:4326');
    length += ol.sphere.WGS84.haversineDistance(c1, c2);
  }
  var output;
  if (length > 1000) {
    output = parseFloat((length / 1000).toPrecision(3)) +
        ' ' + 'km';
  } else {
    output = parseFloat(length.toPrecision(3)) +
        ' ' + 'm';
  }
  return output;
};


/**
 * Handle map browser event.
 * @param {ol.MapBrowserEvent} evt Map browser event.
 * @return {boolean} `false` if event propagation should be stopped.
 * @this {app.Measure}
 * @private
 */
app.Measure.handleEvent_ = function(evt) {
  if (evt.type != ol.MapBrowserEvent.EventType.POINTERMOVE || evt.dragging) {
    return true;
  }

  var helpMsg = this.startMsg;
  if (!goog.isNull(this.sketchFeature)) {
    helpMsg = this.continueMsg;
  }

  goog.dom.removeChildren(this.helpTooltipElement_);
  goog.dom.appendChild(this.helpTooltipElement_, helpMsg);
  this.helpTooltipOverlay_.setPosition(evt.coordinate);

  return true;
};


/**
 * Creates the draw interaction.
 * @param {ol.style.Style|Array.<ol.style.Style>|ol.style.StyleFunction|undefined}
 *     style The sketchStyle used for the drawing interaction.
 * @param {ol.source.Vector} source Vector source.
 * @return {ol.interaction.Draw|ngeo.interaction.DrawAzimut}
 * @protected
 */
app.Measure.prototype.getDrawInteraction = goog.abstractMethod;


/**
 * @inheritDoc
 */
app.Measure.prototype.setMap = function(map) {
  goog.base(this, 'setMap', map);

  this.vectorLayer_.setMap(map);

  var prevMap = this.drawInteraction_.getMap();
  if (!goog.isNull(prevMap)) {
    prevMap.removeInteraction(this.drawInteraction_);
  }

  if (!goog.isNull(map)) {
    map.addInteraction(this.drawInteraction_);
  }
};


/**
 * Handle draw interaction `drawstart` event.
 * @param {ol.interaction.DrawEvent} evt
 * @private
 */
app.Measure.prototype.onDrawStart_ = function(evt) {
  this.sketchFeature = evt.feature;
  this.vectorLayer_.getSource().clear(true);
  this.createMeasureTooltip_();

  var geometry = this.sketchFeature.getGeometry();
  goog.asserts.assert(goog.isDef(geometry));
  this.changeEventKey_ = goog.events.listen(geometry,
      goog.events.EventType.CHANGE,
      function() {
        this.handleMeasure(goog.bind(function(measure, coord) {
          if (!goog.isNull(coord)) {
            this.measureTooltipElement_.innerHTML = measure;
            this.measureTooltipOverlay_.setPosition(coord);
          }
        }, this));
      }, false, this);
};


/**
 * Handle draw interaction `drawend` event.
 * @param {ol.interaction.DrawEvent} evt
 * @private
 */
app.Measure.prototype.onDrawEnd_ = function(evt) {
  goog.dom.classlist.add(this.measureTooltipElement_, 'tooltip-static');
  this.measureTooltipOverlay_.setOffset([0, -7]);
  if (this.modifyMode) {
    this.modifyMode = false;
    this.setActive(false);
    this.dispatchEvent(
        new app.MeasureEvent(app.MeasureEventType.MODIFYMEASUREEND,
        this.sketchFeature));
  }else {
    this.dispatchEvent(new app.MeasureEvent(app.MeasureEventType.MEASUREEND,
        this.sketchFeature));
  }
  this.sketchFeature = null;
  goog.events.unlistenByKey(this.changeEventKey_);
};


/**
 * Creates a new help tooltip
 * @private
 */
app.Measure.prototype.createHelpTooltip_ = function() {
  this.removeHelpTooltip_();
  this.helpTooltipElement_ = goog.dom.createDom(goog.dom.TagName.DIV);
  goog.dom.classlist.add(this.helpTooltipElement_, 'tooltip');
  this.helpTooltipOverlay_ = new ol.Overlay({
    element: this.helpTooltipElement_,
    offset: [15, 0],
    positioning: 'center-left'
  });
  this.getMap().addOverlay(this.helpTooltipOverlay_);
};


/**
 * Destroy the help tooltip
 * @private
 */
app.Measure.prototype.removeHelpTooltip_ = function() {
  this.getMap().removeOverlay(this.helpTooltipOverlay_);
  if (!goog.isNull(this.helpTooltipElement_)) {
    this.helpTooltipElement_.parentNode.removeChild(this.helpTooltipElement_);
  }
  this.helpTooltipElement_ = null;
  this.helpTooltipOverlay_ = null;
};


/**
 * Creates a new measure tooltip
 * @private
 */
app.Measure.prototype.createMeasureTooltip_ = function() {
  this.removeMeasureTooltip_();
  this.measureTooltipElement_ = goog.dom.createDom(goog.dom.TagName.DIV);
  goog.dom.classlist.addAll(this.measureTooltipElement_,
      ['tooltip', 'tooltip-measure']);
  this.measureTooltipOverlay_ = new ol.Overlay({
    element: this.measureTooltipElement_,
    offset: [0, -15],
    positioning: 'bottom-center',
    stopEvent: false
  });
  this.getMap().addOverlay(this.measureTooltipOverlay_);
};


/**
 * Destroy the help tooltip
 * @private
 */
app.Measure.prototype.removeMeasureTooltip_ = function() {
  if (!goog.isNull(this.measureTooltipElement_)) {
    this.measureTooltipElement_.parentNode.removeChild(
        this.measureTooltipElement_);
    this.measureTooltipElement_ = null;
    this.measureTooltipOverlay_ = null;
  }
};


/**
 * @private
 */
app.Measure.prototype.updateState_ = function() {
  var active = this.getActive();
  this.drawInteraction_.setActive(active);
  if (!this.getMap()) {
    return;
  }
  if (active) {
    this.createMeasureTooltip_();
    this.createHelpTooltip_();
  } else {
    this.vectorLayer_.getSource().clear(true);
    this.getMap().removeOverlay(this.measureTooltipOverlay_);
    this.removeMeasureTooltip_();
    this.removeHelpTooltip_();
  }
};


/**
 * Function implemented in inherited classes to compute measurement, determine
 * where to place the tooltip and determine which help message to display.
 * @param {function(string, ?ol.Coordinate)} callback The function
 *     to be called.
 * @protected
 */
app.Measure.prototype.handleMeasure = goog.abstractMethod;


/**
 * Get a reference to the tooltip element.
 * @return {Element}
 */
app.Measure.prototype.getTooltipElement = function() {
  return this.measureTooltipElement_;
};


/**
 * Get the current draw interaction.
 * @return {ol.interaction.Draw|ngeo.interaction.DrawAzimut}
 */
app.Measure.prototype.getCurrentDrawInteraction = function() {
  return this.drawInteraction_;
};