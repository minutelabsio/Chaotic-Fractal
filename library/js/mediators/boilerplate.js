define([
    'jquery',
    'moddef',
    'require',
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
    M,
    require,
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
            this.diagramsComplete = 1;
            this.axisThickness = 60;

            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.width = window.innerWidth - self.axisThickness;
            this.height = this.width * 9/16;

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
            this.rLine.lineStyle( 2, 0xcc0000, 0.4 );
            this.rLine.moveTo(0, this.yaxis.range[1] - this.height);
            this.rLine.lineTo(0, this.yaxis.range[0] + this.height);
            this.panContainer.addChild( this.rLine );
            this.unscale.push(this.rLine);

            this.marker = new PIXI.Graphics();
            this.marker.beginFill( 0xcc0000 );
            this.marker.drawCircle(0, 0, 5);
            this.marker.endFill();
            this.panContainer.addChild( this.marker );
            this.unscale.push(this.marker);

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
                .attr('width', this.axisThickness)
                .attr('height', self.height + self.axisThickness)
                ;

            x = d3.select( '#chart' ).append( 'svg' ).attr('class', 'xaxis')
                .attr('width', this.width)
                .attr('height', this.axisThickness)
                ;

            self.d3xAxisEl = x.append('g')
                .call( self.d3xAxis )
                ;

            self.d3yAxisEl = y.append('g')
                .attr('transform', 'translate('+this.axisThickness+',0)')
                .call( self.d3yAxis )
                ;

            this.on('resize', function(){
                x.attr('width', self.width);
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

                // self.zoom += 0.0001 * dt;
                self.emit('zoom', self.zoom);
            });

            $(window).on('resize', function(){
                self.width = window.innerWidth - self.axisThickness;
                self.height = self.width * 9/16;
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
                self.setR( self.getPlotValues(e.center.x - self.axisThickness, 0)[0] );
            }

            this.after('domready').then(function(){
                var mc = new Hammer(document.getElementById('chart'));
                mc.get('pan').set({ direction: Hammer.DIRECTION_ALL });
                mc.on('panstart', grab)
                    .on('panmove', move)
                    .on('panend', release)
                    .on('tap', changeR);

                $(document).on('mousewheel', '#chart', function( e ){
                    e.preventDefault();
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

        ,setR: function( r ){

            r = Math.min( Math.max(r, this.rmin), this.rmax );

            var x = this.xaxis( +r );
            this._r = r;
            this.rLine.x = x;
            this.marker.x = x;

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

            for ( var i = 0, l = this.unscale.length; i < l; i++ ){
                this.unscale[ i ].scale.x = 1/sx;
                this.unscale[ i ].scale.y = 1/sy;
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

            self.initAxes();
            $('#chart .xaxis').before( this.renderer.view );

            this.slides = SlideManager({
                el: '#story'
            });

            this.equation = Equation({
                el: '.equation'
            });

            self.setR(this.equation.r);

            this.on('change:r', function( e, r ){
                self.equation.setR( r );
            });

            this.equation.on('next', function( e, val ){
                var y = self.yaxis( val );
                self.marker.y = y;
            });

            this.on('pan', function(){
                self.drawAxes();
            });
        }

    }, ['events']);

    return new Mediator();
});
