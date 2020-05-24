L.MapBase = L.Class.extend({
    statics: { Cur: null },
    includes: L.Mixin.Events,
    options: {
        containerId: null,
        apiURL: null,
        geoApiURL: null,
        autoLoadStop: false,
        searchCtrl: false,
        locateCtrl: false
    },
    map: null,
    jMapContainer: null,
    rightClick: { Pos: null, Time: null },
    initCompleted: false,
    layerStop: null,
    layerPath: null,
    ctrlSearch: null,
    ctrlLocate: null,

    initialize: function (options) {
        L.setOptions(this, options);
        if (!this.options.containerId) return;
        L.MapBase.Cur = this;
        this._initControl();
    },

    _initControl: function () {
        this.jMapContainer = $('#{0}'.format(this.options.containerId));
        this.jMapContainer.keydown(this, this._onMapKeyDown);
        this._initMap();
    },

    _onMapKeyDown: function (e) {
        return preventKeyDown(e);
    },

    _initMap: function () {
        //init map
        this.map = L.map(this.options.containerId, {
            center: L.Config.MapOpt.center,
            zoom: L.Config.MapOpt.zoom,
            minZoom: L.Config.MapOpt.minZoom,
            layers: [L.tileLayer(L.Config.MapOpt.tileURL, { attribution: L.Config.MapOpt.attribution })],
            zoomControl: true,
            attributionControl: false,
            panControl: false
        });

        this.map.addLayer(this.layerStop = L.layerGroupBase());
        this.map.addLayer(this.layerPath = L.layerGroupBase());
        this.map.on("contextmenu", this._onMapContextMenu, this);
        this.map.on('resize', this._onMapResize, this);
        this.map._onResize();

        if (this.options.searchCtrl) this.addControl(this.ctrlSearch = new L.Search(this.jMapContainer,
            {
                geoApiURL: this.options.geoApiURL,
                dfText: L.Res.Search.Prompt
            }));

        if (this.options.locateCtrl)
            this.addControl(this.ctrlLocate = L.control.locate({
                strings: {
                    title: L.Res.Locate.Title,
                    popup: L.Res.Locate.Popup,
                    metersUnit: L.Res.Locate.Meter,
                    locationErrorMsg: L.Res.Locate.LocationErrorMsg,
                    outsideMapBoundsMsg: L.Res.Locate.OutsideMapBoundsMsg
                }
            }));
        if (this.options.autoLoadStop) this.enableAutoLoadStop(true);

        this._fireInitCompletedEvt();
        this.onInitCompleted();
    },

    _onMapContextMenu: function (e) {
        var curPos = { x: e.latlng.lat.toFixed(4), y: e.latlng.lng.toFixed(4) };
        var curTime = (new Date()).format("dd/MM/yyyy HH:mm:ss");

        if (this.rightClick.Time == curTime && this.rightClick.Pos.x == curPos.x && this.rightClick.Pos.y == curPos.y)
            this.map.setZoom(Math.max(this.map.getMinZoom(), this.map.getZoom() - 1));

        this.rightClick = { Pos: curPos, Time: curTime };
        curPos = curTime = null;
    },

    _onMapResize: function (e) {
        this.layerStop.fitInView();
    },

    _onMapMoveEnd: function (e) {
        if (this.options.autoLoadStop) {
            if (this.map.getZoom() >= L.Config.MapOpt.thresholdZoom)
                this.showStopsArroundMe(this.map.getCenter());
            else
                this.clearLayers();
        }
    },

    _fireInitCompletedEvt: function () {
        this.initCompleted = true;
        this.fire('initCompletedEvt');
    },

    onInitCompleted: function () {
        //function is overrided in child class
    },

    setCenter: function (latLng) {
        if (latLng) this.map.panTo(latLng);
    },

    clearLayers: function () {
        this.layerStop.clearLayers();
        this.layerPath.clearLayers();
    },

    clearStops: function (keepId) {
        if (keepId) {
            var stops = this.layerStop.getLayers();
            for (var i = stops.length - 1; i >= 0 ; i--) {
                if (stops[i].options.id == keepId) continue;
                this.layerStop.removeLayer(stops[i]);
            }
        }
        else {
            this.layerStop.clearLayers();
        }
    },

    enableAutoLoadStop: function (alsoLoad) {
        this.options.autoLoadStop = true;
        this.map.on("moveend", this._onMapMoveEnd, this);
        if (alsoLoad) this.focusMe(L.Config.MapOpt.center);
    },

    disableAutoLoadStop: function (alsoClear) {
        this.options.autoLoadStop = false;
        this.map.off("moveend", this._onMapMoveEnd, this);
        if (alsoClear) this.clearLayers();
    },

    focusMe: function (latlng, name) {
        if (latlng instanceof L.LatLng) {
            var zoom = this.map.getZoom(),
                minZoom = Math.max(zoom, L.Config.MapOpt.thresholdZoom);
            this.map.setView(latlng, minZoom, { reset: true });
        }
        this.showMe(latlng, name);
    },

    showMe: function (latlng, name) {
        if (latlng instanceof L.LatLng && name) {
            var id = new Date().toDateString(),
                marker = L.marker(latlng, { id: id, icon: L.MapBase.GetHereIcon() }).bindPopup(L.popupBase({ id: id }).setContent(name));
            this.layerStop.addLayer(marker);
            marker.openPopup();
        }
    },

    showStopsArroundMe: function (latlng, name) {
        if (!latlng) return;

        this.disableAutoLoadStop();
        var bBox = this.map.getBounds().pad(0.02).toBBoxString(),
            params = bBox.replaceAll(",", "/"),
            options = {};
        options.url = "{0}/businfo/getstopsinbounds/{1}".format(this.options.apiURL, params);
        options.type = "GET";
        options.success = function (data) {
            if (data && data.length) {
                var stop = null, mStop = null;
                L.MapBase.ClearStops(L.MapBase.CurPopupId());
                for (var i = 0; i < data.length; i++) {
                    stop = data[i];
                    mStop = L.markerStopArround(
                        L.latLng(stop.Lat, stop.Lng),
                        {
                            data: stop,
                            icon: L.MapBase.GetStopIcon()
                        });
                    L.MapBase.Cur.layerStop.addLayer(mStop);
                }
            }

            L.MapBase.EnableAutoLoadStop();
        };
        options.error = function (jqXHR, textStatus, err) { L.MapBase.EnableAutoLoadStop(); };
        $.ajax(options);
    },

    geoSearch: function (address) {
        if (!this.map || !address) return;

        var refCoor = L.Config.MapOpt.center;	//this.map.getCenter();
        $.getJSON('{0}/geocoding/?q={1}&lat={2}&lon={3}&limit={4}'.format(this.options.geoApiURL, address, refCoor.lat, refCoor.lng, L.Config.GeoCodingLimit))
        .done(function (data) {
            try {
                if (data && data.features) {
                    data = data.features;
                    if (data.length) {
                        data = data[0];
                        var coor = data.geometry.coordinates,
                            name = data.properties.name,
                            lat, lng;
                        if (coor.length)
                            lng = coor[0];
                        if (coor.length > 1)
                            lat = coor[1];
                        if (lat && lng) {
                            var latlng = L.latLng(lat, lng);
                            L.MapBase.DisableAutoLoadStop();
                            L.MapBase.FocusMe(latlng, name);
                            L.MapBase.ShowStopsArroundMe(latlng, name);
                            return;
                        }
                    }
                }
            } catch (err) { }
            alert(L.Res.Common.NotFound);
        })
        .fail(function (jqXHR, textStatus, err) { alert(L.Res.Common.NotFound); });
    },

    addControl: function (control) {
        if (this.map && control && !control._map) this.map.addControl(control);
    },

    removeControl: function (control) {
        if (this.map && control && control._map) this.map.removeControl(control);
    },

    stopIsExisting: function (id) {
        var stops = this.layerStop.getLayers();
        for (var i = 0; i < stops.length; i++) {
            if (stops[i].options.id == id)
                return true;
        }
        return false;
    }
});

L.mapBase = function (options) { return new L.MapBase(options); };

L.MapBase.GetStopInVarIcon = function (iName) {
    if (iName != L.Constants.InVarIcon.Start && iName != L.Constants.InVarIcon.End &&
        (eval(iName) < 0 || eval(iName) > L.Constants.InVarIcon.MaxSupport))
        iName = L.Constants.InVarIcon.Default;

    var iSize = L.Constants.InVarIcon.Size;
    return L.icon({
        iconUrl: L.Constants.InVarIcon.URL.format(iName),
        iconSize: new L.Point(iSize, iSize),
        iconAnchor: new L.Point(iSize / 2, iSize),
        popupAnchor: new L.Point(0, 0 - iSize / 2 - 3)
    })
};

L.MapBase.GetHereIcon = function () {
    var config = L.Constants.HereIcon;
    return L.icon({
        iconUrl: config.URL,
        iconSize: new L.Point(config.W, config.H),
        iconAnchor: new L.Point(config.W / 2, config.H),
        popupAnchor: new L.Point(0, 0 - config.H / 2 - 16)
    })
};

L.MapBase.GetStopIcon = function () {
    var config = L.Constants.StopIcon;
    return L.icon({
        iconUrl: config.URL,
        iconSize: new L.Point(config.W, config.H),
        iconAnchor: new L.Point(config.W / 2, config.H),
        popupAnchor: new L.Point(0, 0 - config.H / 2 - 3)
    })
};

L.MapBase.SetCenter = function (latlng) {
    if (L.MapBase.Cur) L.MapBase.Cur.setCenter(latlng);
};

L.MapBase.ClearLayers = function () {
    if (L.MapBase.Cur) L.MapBase.Cur.clearLayers();
};

L.MapBase.ClearStops = function (keepId) {
    if (L.MapBase.Cur) L.MapBase.Cur.clearStops(keepId);
};

L.MapBase.EnableAutoLoadStop = function (alsoLoad) {
    if (L.MapBase.Cur) L.MapBase.Cur.enableAutoLoadStop(alsoLoad);
};

L.MapBase.DisableAutoLoadStop = function (alsoClear) {
    if (L.MapBase.Cur) L.MapBase.Cur.disableAutoLoadStop(alsoClear);
};

L.MapBase.FocusMe = function (latlng, name) {
    if (L.MapBase.Cur) L.MapBase.Cur.focusMe(latlng, name);
};

L.MapBase.ShowStopsArroundMe = function (latlng, name) {
    if (L.MapBase.Cur) L.MapBase.Cur.showStopsArroundMe(latlng, name);
};

L.MapBase.GeoSearch = function (address) {
    if (L.MapBase.Cur) L.MapBase.Cur.geoSearch(address);
};

L.MapBase.StopIsExisting = function (id) {
    if (L.MapBase.Cur) return L.MapBase.Cur.stopIsExisting(id);
    return false;
};

L.MapBase.CurPopupId = function () {
    if (L.MapBase.Cur && L.MapBase.Cur.map)
        return L.MapBase.Cur.map.curPopupId;
    return 0;
};