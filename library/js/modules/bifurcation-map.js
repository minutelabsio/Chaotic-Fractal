define([
    'jquery',
    'moddef',
    'require',
    'tween',
    'util/helpers',
    'hammerjs',
    'd3',
    'pixi',
    'util/scale',
    'when',
    'when/sequence'
], function(
    $,
    M,
    require,
    TWEEN,
    helpers,
    Hammer,
    d3,
    PIXI,
    Scale,
    when,
    sequence
) {
    'use strict';

    var tileDims = {
        x: 1600
        ,y: 900
    };

    var emptyTileTexture = (function(){
        var g = new PIXI.Graphics();
        g.beginFill( 0xffffff );
        g.lineStyle( 2, 0xffffff );
        g.drawRect( 0, 0, tileDims.x-4, tileDims.y-4 );
        g.endFill();
        g.boundsPadding = 0;
        var t = g.generateTexture();
        t.width = tileDims.x;
        t.height = tileDims.y;
        return t;
    })();

    // Page-level Module
    var Module = M({

        // Module Constructor
        constructor: function(){

            var self = this;

            this.$chart = $('<div>');
            this.imgView = { x: [1, 5], y: [1, 0] };
            this.rmin = -2;
            this.rmax = 4;
            this.xmin = -0.5;
            this.xmax = 1.5;
            this.friction = 0.1;
            this.position = new PIXI.Point();
            this.scale = new PIXI.Point(1,1);
            this.velocity = {x: 0, y: 0};
            this.maxLayers = 6;
            this.minScale = {x: 0.25, y: 0.25};
            this.maxScale = {x: Math.pow(2, this.maxLayers), y: Math.pow(2, this.maxLayers)};
            this.unscale = [];
            this.layers = [];
            this.markers = [];
            this.loadedTiles = {};
            this.axisThickness = 80;

            this.resize();

            this.xaxis = Scale([this.rmin, this.rmax], [ 0, tileDims.x ]);
            this.yaxis = Scale([this.xmin, this.xmax], [ tileDims.y, 0 ]);

            if ( window.Modernizr.touch ){
                this.renderer = new PIXI.CanvasRenderer(this.width, this.height, null, true);
            } else {
                this.renderer = PIXI.autoDetectRenderer(this.width, this.height, null, true);
            }
            this.stage = new PIXI.Stage(0x000000);
            this.stage.setInteractive(true);

            this.panContainer = new PIXI.DisplayObjectContainer();
            this.zoomContainer = new PIXI.DisplayObjectContainer();
            this.bifurcationContainer = new PIXI.DisplayObjectContainer();
            this.panContainer.addChild( this.bifurcationContainer );
            this.zoomContainer.addChild( this.panContainer );
            this.stage.addChild( this.zoomContainer );

            this.rLine = new PIXI.Graphics();
            this.rLine.lineStyle( 2, 0x555555, 0.4 );
            this.rLine.moveTo(0, this.yaxis.range[1] - this.height);
            this.rLine.lineTo(0, this.yaxis.range[0] + this.height);
            this.panContainer.addChild( this.rLine );
            this.unscale.push(this.rLine);

            self.initEvents();
            self.initMap();
            self.initAxes();
            self.$chart.find('.xaxis').before( this.renderer.view );

            this.emit('resize');
            self.positionDiagram();
        }

        ,initAxes: function(){
            var self = this
                ,svg
                ,x
                ,y
                ;

            self.d3xAxis = d3.svg.axis();
            self.d3yAxis = d3.svg.axis().orient('left');
            self.d3xScale = d3.scale.linear().range([0, this.width]);
            self.d3yScale = d3.scale.linear().range([0, this.height]);

            y = d3.select( self.$chart[0] ).append( 'svg' ).attr('class', 'yaxis')
                .style('margin-top', '-20px')
                .attr('width', this.axisThickness)
                .attr('height', self.height + self.axisThickness)
                ;

            x = d3.select( self.$chart[0] ).append( 'svg' ).attr('class', 'xaxis')
                .style('margin-left', '-40px')
                .attr('width', this.width + 40)
                .attr('height', this.axisThickness)
                ;

            self.d3xAxisEl = x.append('g')
                .attr('transform', 'translate(40,0)')
                .call( self.d3xAxis )
                ;

            self.d3yAxisEl = y.append('g')
                .attr('transform', 'translate('+this.axisThickness+',20)')
                .call( self.d3yAxis )
                ;

            this.on('resize', function(){
                x.attr('width', self.width + 40);
                y.attr('height', self.height + self.axisThickness);
                self.d3xScale.range([0, self.width]);
                self.d3yScale.range([0, self.height]);
                self.drawAxes();
            });

            self.drawAxes();
        }

        ,drawAxes: function(){

            var self = this
                ,x = self.d3xScale.domain( self.imgView.x )
                ,y = self.d3yScale.domain( self.imgView.y )
                ;

            self.d3xAxis.scale( x );
            self.d3yAxis.scale( y );

            self.d3xAxisEl.call( self.d3xAxis );
            self.d3yAxisEl.call( self.d3yAxis );

        }

        ,resize: function(){
            this.width = window.innerWidth - this.axisThickness;
            this.height = this.width * 9/16;

            this.height = Math.min( this.height, window.innerHeight - this.axisThickness - 200 );
            this.emit('resize');
        }

        // Initialize events
        ,initEvents: function(){

            var self = this
                ,pt = helpers.now()
                ;

            // setup animation frame
            function frame(){
                var time = helpers.now();
                self.emit('frame', time - pt);
                pt = time;
                window.requestAnimationFrame( frame );
                self.renderer.render( self.stage );
            }

            frame();

            // other events
            self.on('frame', function( e, dt ){

                TWEEN.update();
            });

            $(window).on('resize', function(){
                self.resize();
                self.renderer.resize(self.width, self.height);
            });

            this.on('resize', function(){
                var cn = self.zoomContainer;
                cn.x = self.width * 0.5;
                cn.y = self.height * 0.5;

                self.panTo( self.position.x, self.position.y );
            });

            // stage
            var start;
            function grab( e ){
                if ( e.pointers.length === 1 ){
                    self.flickBy( 0, 0 );
                    start = self.position.clone();
                }
            }

            function move( e ){
                self.panTo( start.x - e.deltaX/self.zoomContainer.scale.x, start.y - e.deltaY/self.zoomContainer.scale.y );
            }

            function release( e ){
                var sx = 1/self.zoomContainer.scale.x;
                var sy = 1/self.zoomContainer.scale.y;
                self.panTo( start.x - e.deltaX * sy, start.y - e.deltaY * sy );
                self.flickBy( e.velocityX * sx, e.velocityY * sy );
                start = null;
            }

            function changeR( e ){
                var top = self.$chart.offset().top - $(document).scrollTop();
                var vals = self.getPlotValues(e.center.x - self.axisThickness, e.center.y - top);
                // if ( vals[0] > 0 ){
                //     vals[1] = Math.min(Math.max(vals[1], 0), 1);
                // }
                self.setR( vals[0] );
                self.emit( 'set:x', vals[1] );
            }

            var mc = new Hammer( self.$chart[0] );
            mc.get('pan').set({ direction: Hammer.DIRECTION_ALL });
            mc.on('panstart', grab)
                .on('panmove', move)
                .on('panend', release)
                .on('tap', changeR);

            mc.on('pinch', function(e){
                self.scaleTo( e.scale, e.scale );
            });

            self.$chart.on('mousewheel', function( e ){
                e.preventDefault();
                e.stopImmediatePropagation();
                var z = -e.originalEvent.deltaY / 1000;
                self.zoomBy( z, z );
            });

            this.on('pan', function(){
                self.drawAxes();
                self.rLine.y = self.yaxis( self.imgView.y[0] );
            });

            this.on('scale', function(){
                self.showTileLayer( self.getZoom() );
            });

            self.on('frame', function( e, dt ){
                var x = self.velocity.x *= 1-self.friction;
                var y = self.velocity.y *= 1-self.friction;
                if ( (x*x + y*y) > 0.01 ){
                    self.panTo( self.position.x + self.velocity.x * dt, self.position.y + self.velocity.y * dt );
                }
            });

            self.on('pan', helpers.throttle(function(){
                if ( self.positioned ){
                    self.checkTileState();
                }
            }, 100));
        }

        ,flickBy: function( vx, vy ){

            this.velocity.x = vx;
            this.velocity.y = vy;
        }

        ,panTo: function( x, y ){
            var self = this
                ,hw = 0.5 * self.width
                ,hh = 0.5 * self.height
                ;

            x = Math.min(Math.max(x, this.xaxis.range[0] - 0.5*this.width), this.xaxis.range[1] - 0.5*this.width);
            y = Math.min(Math.max(y, this.yaxis.range[1] - 0.5*this.height), this.yaxis.range[0] - 0.5*this.height);

            self.position.x = x;
            self.position.y = y;
            self.panContainer.x = -x-self.zoomContainer.x;
            self.panContainer.y = -y-self.zoomContainer.y;

            if ( this.positioned ){
                self.imgView.x[0] = self.xaxis.invert(x - hw / self.scale.x + hw);
                self.imgView.x[1] = self.xaxis.invert(x + hw / self.scale.x + hw);
                self.imgView.y[0] = self.yaxis.invert(y - hh / self.scale.y + hh);
                self.imgView.y[1] = self.yaxis.invert(y + hh / self.scale.y + hh);
            }

            self.emit('pan', [x, y]);
        }

        ,getPlotValues: function( x, y ){

            var self = this
                ,hw = 0.5 * self.width
                ,hh = 0.5 * self.height
                ;

            return [
                self.xaxis.invert(self.position.x + (x - hw) / self.scale.x + hw)
                ,self.yaxis.invert(self.position.y + (y - hh) / self.scale.y + hh)
            ];
        }

        ,markerAt: function( x, y ){
            var self = this
                ,tween
                ,marker = new PIXI.Graphics()
                ,lines = {
                    count: 1
                    ,max: 4
                    ,radius: 8
                    ,opacity: 1
                    ,color: 0x009C0D
                    ,amount: 6
                }
                ;

            marker.x = x;
            marker.y = y;
            marker.scale.x = 1/this.scale.x;
            marker.scale.y = 1/this.scale.y;

            tween = new TWEEN.Tween( lines )
                .to( { count: lines.amount }, 3000 )
                .onUpdate(function(){
                    var val = Math.min(this.max, this.count);
                    var frac;
                    marker.clear();

                    if ( this.count < (this.max - 1) ){
                        marker.lineStyle( 1, this.color, 1 );
                        marker.drawCircle( 0, 0, this.radius );
                    }

                    for ( var i = 1; i < val; i++ ){
                        frac = Math.max(0, helpers.lerp( 1, 0, ( this.count - i ) / lines.max ));
                        marker.lineStyle( 1, this.color, frac * this.opacity );
                        marker.drawCircle( 0, 0, frac * this.radius  );
                    }
                })
                .onComplete(function(){
                    var idx = self.markers.indexOf( marker );
                    if ( idx > -1 ){
                        self.markers.splice( idx, 1 );
                        self.panContainer.removeChild( marker );
                    }
                })
                .start()
                ;

            marker.tween = tween;
            this.panContainer.addChild( marker );
            this.markers.push( marker );
        }

        ,clearMarkers: function(){
            for ( var i = 0, l = this.markers.length; i < l; i++ ){
                this.markers[i].tween.stop();
                this.panContainer.removeChild( this.markers[i] );
            }

            this.markers = [];
        }

        ,setR: function( r ){

            r = Math.min( Math.max(r, this.rmin), this.rmax );

            var x = this.xaxis( +r );
            this._r = r;
            this.rLine.x = x;

            this.clearMarkers();
            this.emit('change:r', r);
        }

        ,zoomBy: function( dzx, dzy ){

            var container = this.zoomContainer;

            this.scaleTo(
                container.scale.x * Math.pow(2, dzx),
                container.scale.y * Math.pow(2, dzy)
            );
        }

        ,scaleTo: function( sx, sy ){
            var container = this.zoomContainer, idx;
            var i, l;
            sx = Math.min(this.maxScale.x, Math.max(this.minScale.x, sx));
            sy = Math.min(this.maxScale.y, Math.max(this.minScale.y, sy));

            this.scale.x = container.scale.x = sx;
            this.scale.y = container.scale.y = sy;

            for ( i = 0, l = this.unscale.length; i < l; i++ ){
                this.unscale[ i ].scale.x = 1/sx;
                this.unscale[ i ].scale.y = 1/sy;
            }

            for ( i = 0, l = this.markers.length; i < l; i++ ){
                this.markers[ i ].scale.x = 1/sx;
                this.markers[ i ].scale.y = 1/sy;
            }

            this.emit('scale');
            this.panTo( this.position.x, this.position.y );
        }

        ,positionDiagram: function(){

            var self = this
                ,container = this.panContainer
                ,xaxis = this.xaxis
                ,yaxis = this.yaxis
                ,res = this.resolution
                ,v = self.imgView
                ;

            var w = this.width;
            var h = this.height;

            var s = w/(xaxis(v.x[1]) - xaxis(v.x[0]));
            this.positioned = true;
            this.panTo(xaxis(v.x[0]) + 0.5 * w / s - 0.5 * w, yaxis(v.y[0]) + 0.5 * h / s - 0.5 * h);
            this.scaleTo(s, s);

        }

        ,getZoom: function( scale ){
            scale = scale || this.scale.x;
            return Math.min( this.maxLayers - 1, Math.max( 0, Math.ceil( Math.log( scale ) / Math.LN2 ) ) );
        }

        ,showTileLayer: function( zoom ){

            var layer;
            for ( var i = 0, l = this.maxLayers; i < l; i++ ){
                layer = this.layers[ i ];
                if ( layer ){
                    layer.visible = false;
                }
            }

            this.layers[ zoom ].visible = true;
        }

        ,checkTileState: function(){
            var self = this
                ,zoom = this.getZoom()
                ,edge = Math.pow(2, zoom)
                ,w = tileDims.x / edge
                ,h = tileDims.y / edge
                ,hw = this.width * 0.5
                ,hh = this.height * 0.5
                ,xmin = this.position.x - hw / self.scale.x + hw
                ,ymin = this.position.y - hh / self.scale.x + hh
                ,xmax = this.position.x + hw / self.scale.x + hw
                ,ymax = this.position.y + hh / self.scale.x + hh
                ;

            for ( var i = Math.max(0, Math.floor(xmin / w)), il = Math.ceil(xmax / w); i < il && i < edge; i++ ){
                for ( var j = Math.max(0, Math.floor(ymin / h)), jl = Math.ceil(ymax / h); j < jl && j < edge; j++ ){
                    this.loadTile( zoom, i, j );
                }
            }

        }

        ,getTileLayer: function( zoom ){

            var layer = this.layers[ zoom ]
                ,edge = Math.pow(2, zoom)
                ;

            if ( !layer ){
                layer = this.layers[ zoom ] = new PIXI.DisplayObjectContainer();
                layer.scale.x = 1 / edge;
                layer.scale.y = 1 / edge;
                layer.visible = false;
                this.bifurcationContainer.addChildAt( layer, zoom );
            }

            return layer;
        }

        ,loadTile: function( zoom, i, j ){

            if ( this.loadedTiles[ ''+zoom+i+j ] ){
                return;
            }

            var self = this
                ,layer = this.getTileLayer( zoom )
                ,src = require.toUrl( '../../images/bifurcation/' + zoom + 'x-' + i + '-' + j + '.jpg' )
                ,tile = layer.getChildAt( this.getTileIndex( zoom, i, j ) )
                ;

            if ( tile ){
                tile.setTexture( PIXI.Texture.fromImage( src ) );
                this.loadedTiles[ ''+zoom+i+j ] = true;
            }
        }

        ,getTileIndex: function( zoom, i, j ){
            return i * (Math.pow(2, zoom)) + j;
        }

        ,initMap: function(){

            var self = this
                ,nLayers = this.maxLayers
                ,z
                ,edge
                ,layer
                ,tile
                ;

            for ( z = 0; z < nLayers; z++ ){
                layer = this.getTileLayer( z );
                edge = Math.pow(2, z);

                for ( var i = 0; i < edge; i++ ){
                    for ( var j = 0; j < edge; j++ ){
                        tile = new PIXI.Sprite( emptyTileTexture );
                        tile.width = tileDims.x;
                        tile.height = tileDims.y;
                        tile.x = tileDims.x * i;
                        tile.y = tileDims.y * j;
                        layer.addChildAt( tile, this.getTileIndex( z, i, j ) );
                        // this.loadTile( z, i, j );
                    }
                }
            }
        }

    }, ['events']);

    return Module;
});
