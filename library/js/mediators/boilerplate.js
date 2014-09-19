define([
    'jquery',
    'moddef',
    'require',
    'hammerjs',
    'pixi',
    'util/scale',
    'modules/logical-map-equation',
    'when',
    'when/sequence'
], function(
    $,
    M,
    require,
    Hammer,
    PIXI,
    Scale,
    Equation,
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

            this.imgView = { x: [3, 4], y: [0, 1] };
            this.rmin = -2;
            this.rmax = 4;
            this.xmin = -0.5;
            this.xmax = 1.5;
            this.zoom = 1;
            this.resolution = 2;
            this.friction = 0.1;
            this.position = new PIXI.Point();
            this.velocity = {x: 0, y: 0};
            this.minScale = {x: 0.25, y: 0.25};
            this.maxScale = {x: 8, y: 8};
            this.unscale = [];
            this.diagrams = [];
            this.diagramsComplete = 1;

            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.width = window.innerWidth;
            this.height = window.innerWidth * 9/16;

            this.xaxis = Scale([this.rmin, this.rmax], [ 0, this.width * (this.rmax - this.rmin) ]);
            this.yaxis = Scale([this.xmin, this.xmax], [ this.height * (this.xmax - this.xmin -1), -this.height]);

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
            this.rLine.moveTo(0, this.yaxis.range[1] - this.height*0.5);
            this.rLine.lineTo(0, this.yaxis.range[0] + this.height*0.5);
            this.panContainer.addChild( this.rLine );
            this.unscale.push(this.rLine);

            this.marker = new PIXI.Graphics();
            this.marker.beginFill( 0xcc0000 );
            this.marker.drawCircle(0, 0, 5);
            this.marker.endFill();
            this.panContainer.addChild( this.marker );
            this.unscale.push(this.marker);

            this.xAxisContainer = new PIXI.Graphics();
            this.yAxisContainer = new PIXI.Graphics();
            this.drawAxes();

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

        ,drawAxes: function(){

            var self = this
                ,stage
                ,x
                ,y
                ,inc
                ;

            y = self.yAxisContainer;
            y.clear();
            y.lineStyle( 1, 0x888888 );

            inc = (self.yaxis.domain[1] - self.yaxis.domain[0]) / 5;
            // TODO

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
                self.width = window.innerWidth;
                self.height = window.innerWidth * 9/16;
                self.renderer.resize(self.width, self.height);
                self.emit('resize');
            });

            this.on('resize', function(){
                var cn = self.zoomContainer;
                cn.x = self.width * 0.5;
                cn.y = self.height * 0.5;
                self.positionDiagram();
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

            this.after('domready').then(function(){
                var mc = new Hammer(document.getElementById('chart'));
                mc.get('pan').set({ direction: Hammer.DIRECTION_ALL });
                mc.on('panstart', grab)
                    .on('panmove', move)
                    .on('panend', release);

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
            var self = this;

            x = Math.min(Math.max(x, this.xaxis.range[0] - 0.5*this.width), this.xaxis.range[1] - 0.5*this.width);
            y = Math.min(Math.max(y, this.yaxis.range[1] - 0.5*this.height), this.yaxis.range[0] - 0.5*this.height);

            self.position.x = x;
            self.position.y = y;
            self.panContainer.x = -x-self.zoomContainer.x;
            self.panContainer.y = -y-self.zoomContainer.y;
            self.imgView.x[0] = self.xaxis.invert(x);
            self.imgView.x[1] = self.xaxis.invert(x + self.width);
            self.imgView.y[0] = self.yaxis.invert(y);
            self.imgView.y[1] = self.yaxis.invert(y + self.height);
        }

        ,setR: function( r ){
            var x = this.xaxis( +r );
            this._r = r;
            this.rLine.x = x;
            this.marker.x = x;
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
            container.scale.x = sx;
            container.scale.y = sy;

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
                                    bifSprite.scale.y = -1;
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

            $('#chart').append( this.renderer.view );

            this.equation = Equation({
                el: '#equation'
            });

            self.setR(this.equation.r);

            this.equation.on('next', function( e, val ){
                var y = self.yaxis( val );
                self.marker.y = y;
            });
        }

    }, ['events']);

    return new Mediator();
});
