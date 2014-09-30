define([
    'jquery',
    'jquery.nouislider',
    'moddef',
    'require',
    'tween',
    'util/helpers',
    'hammerjs',
    'd3',
    'pixi',
    'util/scale',
    'modules/logical-map-equation',
    'modules/slide-manager',
    'when',
    'when/sequence'
], function(
    $,
    _jqnoui,
    M,
    require,
    TWEEN,
    helpers,
    Hammer,
    d3,
    PIXI,
    Scale,
    Equation,
    SlideManager,
    when,
    sequence
) {
    'use strict';

    var now = window.performance && window.performance.now ?
		function(){ return window.performance.now(); } :
		Date.now && Date.now.bind(Date) || function(){ return (new Date()).getTime(); };

    // Page-level Mediator
    var Mediator = M({

        // Mediator Constructor
        constructor: function(){

            var self = this;

            this.imgView = { x: [3, 4], y: [1, 0] };
            this.rmin = -2;
            this.rmax = 4;
            this.xmin = -0.5;
            this.xmax = 1.5;
            this.zoom = 1;
            this.resolution = 2;
            this.friction = 0.1;
            this.position = new PIXI.Point();
            this.scale = new PIXI.Point(1,1);
            this.velocity = {x: 0, y: 0};
            this.minScale = {x: 0.25, y: 0.25};
            this.maxScale = {x: 8, y: 8};
            this.unscale = [];
            this.diagrams = [];
            this.markers = [];
            this.diagramsComplete = 1;
            this.axisThickness = 60;

            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.resize();

            this.xaxis = Scale([this.rmin, this.rmax], [ 0, this.width * (this.rmax - this.rmin) ]);
            this.yaxis = Scale([this.xmin, this.xmax], [ this.height * (this.xmax - this.xmin -1), -this.height]);

            // this.on('resize', function(){
            //     this.xaxis = Scale([this.rmin, this.rmax], [ 0, this.width * (this.rmax - this.rmin) ]);
            //     this.yaxis = Scale([this.xmin, this.xmax], [ this.height * (this.xmax - this.xmin -1), -this.height]);
            // }, this);

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

            // worker
            this.worker = new Worker( require.toUrl('workers/bifurcation.js') );
            this.worker.onmessage = function(e) {
                if ( typeof e.data === 'string' ){
                    console.log(e.data);
                    return;
                }

                // console.timeEnd('Create');

                self.tmpCanvas.width = e.data.img.width;
                self.tmpCanvas.height = e.data.img.height;

                self.tmpCtx.putImageData(e.data.img, 0, 0);

                self.emit('generated', { canvas: self.tmpCanvas, ctx: self.tmpCtx, inputData: e.data.inputData });
            };

            self.initEvents();
            self.initDiagram().then(function(){
                self.resolve('fully-loaded');
                self.resolution = 4;
                self.initDiagram().then(function(){
                    self.resolution = 8;
                    self.diagramsComplete++;
                    self.zoomBy(0, 0);
                    // self.initDiagram().then(function(){
                    //     self.diagramsComplete++;
                    //     self.zoomBy(0, 0);
                    // });
                });
            });
            self.diagrams[0].visible = true;

            $(function(){
                self.onDomReady();
                self.resolve('domready');
            });

            this.emit('resize');
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

            y = d3.select( '#chart' ).append( 'svg' ).attr('class', 'yaxis')
                .style('margin-top', '-20px')
                .attr('width', this.axisThickness)
                .attr('height', self.height + self.axisThickness)
                ;

            x = d3.select( '#chart' ).append( 'svg' ).attr('class', 'xaxis')
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
        }

        // Initialize events
        ,initEvents: function(){

            var self = this
                ,pt = now()
                ;

            // setup animation frame
            function frame(){
                var time = now();
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
                self.emit('resize');
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
                self.flickBy( 0, 0 );
                start = self.position.clone();
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
                var vals = self.getPlotValues(e.center.x - self.axisThickness, e.center.y - self.axisThickness + 20);
                // if ( vals[0] > 0 ){
                //     vals[1] = Math.min(Math.max(vals[1], 0), 1);
                // }
                self.setR( vals[0] );
                self.emit( 'set:x', vals[1] );
            }

            this.after('domready').then(function(){
                var mc = new Hammer(document.getElementById('chart'));
                mc.get('pan').set({ direction: Hammer.DIRECTION_ALL });
                mc.on('panstart', grab)
                    .on('panmove', move)
                    .on('panend', release)
                    .on('tap', changeR);

                $('#chart').on('mousewheel', function( e ){
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    var z = -e.originalEvent.deltaY / 1000;
                    self.zoomBy( z, z );
                });
            });

            this.after('init-diagram').then(function(){
                self.positionDiagram();
                self.on('frame', function( e, dt ){
                    var x = self.velocity.x *= 1-self.friction;
                    var y = self.velocity.y *= 1-self.friction;
                    if ( (x*x + y*y) > 0.01 ){
                        self.panTo( self.position.x + self.velocity.x * dt, self.position.y + self.velocity.y * dt );
                    }
                });
            });
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
            if ( self.positioned ){
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
            idx = Math.min(this.diagramsComplete-1, Math.round( Math.log(Math.max(1, Math.ceil(sx-1))) / Math.log(2) ));
            // console.log(sx, idx)
            if ( idx !== this.idx ){
                this.idx = idx;
                for ( var i = 0, l = this.diagrams.length; i < l; i++ ){
                    this.diagrams[i].visible = false;
                }

                this.diagrams[ idx ].visible = true;
            }
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

            this.panTo( this.position.x, this.position.y );
        }

        ,generate: function( w, h, rmin, rmax, xmin, xmax, res ){

            var self = this;
            var worker = this.worker;
            var canvas = this.tmpCanvas;
            var ctx = this.tmpCtx;
            var img = ctx.createImageData( res * w, res * h );

            worker.postMessage({
                method: 'bifurcation',
                img: img,
                skip: 0,
                keep: h * res,
                r: [ rmin, rmax ],
                x: [ xmin, xmax ],
                iterations: res * 10000,

                color: {
                    r: 10,
                    g: 10,
                    b: 10,
                    alpha: 2
                }
            });
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

            self.positioned = true;

            container.scale.x = w / (xaxis(v.x[1]) - xaxis(v.x[0]));
            container.scale.y = h / (yaxis(v.y[1]) - yaxis(v.y[0]));
            this.panTo((xaxis(v.x[0])) * container.scale.x, (yaxis(v.y[0])) * container.scale.y);
        }

        ,initDiagram: function(){

            var self = this
                ,stage = this.stage
                ,w = this.width
                ,h = this.height
                ,rmin = this.rmin
                ,rmax = this.rmax
                ,rinc = 1/this.resolution
                ,xmin = this.xmin
                ,xmax = this.xmax
                ,xinc = xmax - xmin
                ,xaxis = this.xaxis
                ,yaxis = this.yaxis
                ,container = new PIXI.DisplayObjectContainer()
                ,jobs = []
                ;

            container.visible = false;
            this.diagrams.push(container);
            this.bifurcationContainer.addChild( container );

            // loop over tiles
            for ( var r = rmax; r > rmin; r-=rinc ){
                // for ( var x = xmax; x > xmin; x-- ){
                    // define a scope for vars
                    (function(r, x, res){
                        // push a job function into the jobs array
                        jobs.push(function(){

                            var dfd = when.defer();

                            self.on('generated', function( e, data ){

                                var input = data.inputData;
                                var x = xaxis( input.r[0] );
                                var y = yaxis( input.x[0] );
                                self.off(e.topic, e.handler);

                                setTimeout(function(){
                                    var bifSprite = PIXI.Sprite.fromImage( data.canvas.toDataURL('image/png') );
                                    container.addChild( bifSprite );
                                    bifSprite.width = w * rinc;
                                    bifSprite.height = h * xinc;
                                    // console.log(x,y, input.r, input.x)
                                    bifSprite.x = x;
                                    bifSprite.y = y;
                                    bifSprite.scale.y *= -1;
                                    dfd.resolve( bifSprite );
                                }, 10);
                            });

                            self.generate(
                                w,
                                h,
                                r-rinc,
                                r,
                                x-xinc,
                                x,
                                res
                            );

                            return dfd.promise;
                        });
                    })(r, xmax, this.resolution);
                //}
            }

            self.resolve('init-diagram');
            // run jobs in sequence
            return sequence( jobs );
        }

        // DomReady Callback
        ,onDomReady: function(){

            var self = this;
            var vals = { x: 0.5, r: 3.3 };

            self.initAxes();
            $('#chart .xaxis').before( this.renderer.view );

            this.slides = SlideManager({
                el: '#story'
            });

            this.equation = Equation({
                el: '.chart-slide .moving-equation'
                ,x: vals.x
                ,r: vals.r
                // ,animate: false
            });

            self.setR(this.equation.r);

            this.on('change:r', function( e, r ){
                self.equation.setR( r );
            });

            this.equation.on('next', function( e, val ){
                var y = self.yaxis( val );
                self.markerAt( self.rLine.x, y );
            });

            this.on('pan', function(){
                self.drawAxes();
            });

            // sliders
            var $slide1 = $('.slide1');
            var $slide1XInputs = $slide1.find('.x-input');
            var $slide2 = $('.slide2');
            var $slide2XInputs = $slide2.find('.x-input');
            var $slide2RInput = $slide2.find('.r');
            var $chartSlide = $('.chart-slide');

            $slide1.find('.eq-demo .slider').noUiSlider({
                start: vals.x
                ,connect: 'lower'
                ,range: {
                    min: 0.01
                    ,max: 0.99
                }
            }).on('set slide', function(){
                var val = $(this).val();
                vals.x = val;
                $slide1XInputs.html( val );
                $slide2XInputs.html( val );
            });

            $slide2.find('.eq-demo .slider').noUiSlider({
                start: vals.r
                ,connect: 'lower'
                ,range: {
                    min: 3
                    ,max: 3.99
                }
            }).on('set slide', function(){
                var val = $(this).val();
                vals.r = val;
                $slide2RInput.html( val );
            });

            var eqn = Equation({
                el: '.slide3 .moving-equation'
                ,x: vals.x
                ,r: vals.r
            });

            // equation animation tickers
            var ticker1 = helpers.Interval( 4000, function(){
                eqn.next();
            });
            ticker1.pause( this.slides.page !== 2 );

            var ticker2 = helpers.Interval( 3000, function(){
                self.equation.next();
            });
            ticker2.pause( this.slides.page !== 4 );

            self.on('set:x', function( e, x ){
                self.equation.$inLeft.hide();
                self.equation.$inRight.hide();
                self.equation.setBoxVal(self.equation.$outBox.show(), x);
                self.equation.emit('next', x);
                ticker2.refresh();
            });

            // turn on/off equations when slides change to correct page
            this.slides.on('changing', function( e, pages ){
                if ( pages.next === 2 || pages.next === 4 ){
                    eqn.setR( vals.r );
                    eqn.setX( vals.x );
                    self.equation.setR( vals.r );
                    self.equation.setX( vals.x );
                    self.setR( vals.r );
                }
            }).on('page', function( e, page ){
                ticker1.pause( page !== 2 );
                ticker2.pause( page !== 4 );
            });


            $chartSlide.find('.slider').noUiSlider({
                start: Math.exp(1)
                ,connect: 'lower'
                ,range: {
                    min: 1
                    ,max: Math.exp(4 - 0.06)
                }
            }).on('set slide', function(){
                var val = 4000 - (Math.log($(this).val())*1000)|0;
                self.equation.doAnimation = ( val > 1000 )
                ticker2.duration = val;
            });

            $('body').removeClass('loading');
        }

    }, ['events']);

    return new Mediator();
});
