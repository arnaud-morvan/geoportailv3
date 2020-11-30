import logging
import re

from c2cgeoportal_commons.models import DBSession, main
from c2cgeoportal_geoportal.lib.wmstparsing import TimeInformation
from c2cgeoportal_geoportal.views.theme import Theme
from pyramid.view import view_config

log = logging.getLogger(__name__)


class LuxThemes(Theme):

    @view_config(route_name="themes", renderer="json")
    def themes(self):
        return super().themes()

    @view_config(route_name='isthemeprivate', renderer='json')
    def is_theme_private(self):
        theme = self.request.params.get('theme', '')

        cnt = DBSession.query(main.Theme).filter(
            main.Theme.public == False).filter(
            main.Theme.name == theme).count()  # noqa

        if cnt == 1:
            return {'name': theme, 'is_private': True}

        return {'name': theme, 'is_private': False}

    def _layer(self, layer, time_=None, dim=None, mixed=True):
        """Override the _layer method to handle LuxLayerInternalWMS"""
        errors: Set[str] = set()
        layer_info = {"id": layer.id, "name": layer.name, "metadata": self._get_metadatas(layer, errors)}
        if re.search("[/?#]", layer.name):  # pragma: no cover
            errors.add("The layer has an unsupported name '{}'.".format(layer.name))
        if isinstance(layer, main.LayerWMS) and re.search("[/?#]", layer.layer):  # pragma: no cover
            errors.add("The layer has an unsupported layers '{}'.".format(layer.layer))
        if layer.geo_table:
            errors |= self._fill_editable(layer_info, layer)
        if mixed:
            assert time_ is None
            time_ = TimeInformation()
        assert time_ is not None

        errors |= dim.merge(layer, layer_info, mixed)

        if isinstance(layer, main.LayerWMS):
            # Here is the hack
            if layer.ogc_server.name != "Internal WMS":
                wms, wms_errors = self._wms_layers(layer.ogc_server)
                errors |= wms_errors
                if wms is None:
                    return layer_info, errors
            if layer.layer is None or layer.layer == "":
                errors.add("The layer '{}' do not have any layers".format(layer.name))
                return None, errors
            layer_info["type"] = "WMS"
            layer_info["layers"] = layer.layer
            self._fill_wms(layer_info, layer, errors, mixed=mixed)
            # errors |= self._merge_time(time_, layer_info, layer, wms)

        elif isinstance(layer, main.LayerWMTS):
            layer_info["type"] = "WMTS"
            self._fill_wmts(layer_info, layer, errors)

        elif isinstance(layer, main.LayerVectorTiles):
            layer_info["type"] = "VectorTiles"
            self._vectortiles_layers(layer_info, layer)

        return layer_info, errors

    def _fill_wms(self, layer_theme, layer, errors, mixed):
        """Override the _fill_wms method to handle LuxLayerInternalWMS"""
        # Here is the hack
        if layer.ogc_server.name == "Internal WMS":
            return self._fill_wms_internal(layer_theme, layer, errors, mixed)
        else:
            return super()._fill_wms(layer_theme, layer, errors, mixed)

    def _fill_wms_internal(self, layer_theme, layer, errors, mixed):
        '''
        wms, wms_errors = self._wms_layers(layer.ogc_server)
        errors |= wms_errors
        if wms is None:
            return
        '''

        layer_theme["imageType"] = layer.ogc_server.image_type
        if layer.style:  # pragma: no cover
            layer_theme["style"] = layer.style

        layer_theme["childLayers"] = []
        '''
        for layer_name in layer.layer.split(","):
            if layer_name in wms["layers"]:
                wms_layer_obj = wms["layers"][layer_name]
                if not wms_layer_obj["children"]:
                    layer_theme["childLayers"].append(wms["layers"][layer_name]["info"])
                else:
                    for child_layer in wms_layer_obj["children"]:
                        layer_theme["childLayers"].append(wms["layers"][child_layer]["info"])
            else:
                errors.add(
                    "The layer '{}' ({}) is not defined in WMS capabilities from '{}'".format(
                        layer_name, layer.name, layer.ogc_server.name
                    )
                )
        '''

        if "minResolutionHint" not in layer_theme:
            resolution_min = self._get_metadata(layer, "minResolution", errors)

            if resolution_min is not None:
                layer_theme["minResolutionHint"] = resolution_min
            else:
                min_resolutions_hint = [
                    l_["minResolutionHint"] for l_ in layer_theme["childLayers"] if "minResolutionHint" in l_
                ]
                if min_resolutions_hint:
                    layer_theme["minResolutionHint"] = min(min_resolutions_hint)
        if "maxResolutionHint" not in layer_theme:
            resolution_max = self._get_metadata(layer, "maxResolution", errors)

            if resolution_max is not None:
                layer_theme["maxResolutionHint"] = resolution_max
            else:
                max_resolutions_hint = [
                    l_["maxResolutionHint"] for l_ in layer_theme["childLayers"] if "maxResolutionHint" in l_
                ]
                if max_resolutions_hint:
                    layer_theme["maxResolutionHint"] = max(max_resolutions_hint)

        if mixed:
            layer_theme["ogcServer"] = layer.ogc_server.name
