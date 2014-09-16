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
            this.velocity = {x: 0, y: 0};
            this.padding = 100;

            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.width = window.innerWidth;
            this.height = window.innerWidth * 9/16;

            this.xaxis = Scale([this.rmin, this.rmax], [ 0, this.width * (this.rmax - this.rmin) ]);
            this.yaxis = Scale([this.xmin, this.xmax], [ 0, this.height * (this.xmax - this.xmin) ]);

            this.renderer = PIXI.autoDetectRenderer(this.width, this.height, null, true);
			this.stage = new PIXI.Stage(0x000000, true);
			this.stage.setInteractive(true);

            this.bifurcationContainer = new PIXI.DisplayObjectContainer();
            this.stage.addChild( this.bifurcationContainer );

            this.rLine = new PIXI.Graphics();
            this.rLine.lineStyle( 2, 0xcc0000, 0.4 );
            this.rLine.moveTo(0, 0);
            this.rLine.lineTo(0, this.height);
            this.stage.addChild( this.rLine );

            this.marker = new PIXI.Graphics();
            this.marker.beginFill( 0xcc0000 );
            this.marker.drawCircle(0, 0, 5);
            this.marker.endFill();
            this.stage.addChild( this.marker );

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
            self.initDiagram().then(function(){ self.resolve('fully-loaded'); });

            $(function(){
                self.onDomReady();
                self.resolve('domready');
            });
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

            // stage
            var start;
            function grab( e ){
                self.flickBy( 0, 0 );
                start = self.bifurcationContainer.position.clone();
                start.x *= -1;
                start.y *= -1;
            }

            function move( e ){
                self.panTo( start.x - e.deltaX, start.y - e.deltaY );
            }

            function release( e ){
                self.panTo( start.x - e.deltaX, start.y - e.deltaY );
                self.flickBy( e.velocityX, e.velocityY );
                start = null;
            }

            this.after('domready').then(function(){
                var mc = new Hammer(document.getElementById('chart'));
                mc.get('pan').set({ direction: Hammer.DIRECTION_ALL });
                mc.on('panstart', grab)
                    .on('panmove', move)
                    .on('panend', release);
            });

            this.after('init-diagram').then(function(){
                self.positionDiagram();
                self.on('frame', function( e, dt ){
                    self.velocity.x *= 1-self.friction;
                    self.velocity.y *= 1-self.friction;
                    if ( (self.velocity.x + self.velocity.y) > 0.01 ){
                        self.panTo( -self.bifurcationContainer.x + self.velocity.x * dt, -self.bifurcationContainer.y + self.velocity.y * dt );
                    }
                });
            });
        }

        ,flickBy: function( vx, vy ){

            this.velocity.x = vx;
            this.velocity.y = vy;
        }

        ,panTo: function( x, y ){
            var self = this, pad = this.padding;

            x = Math.min(Math.max(x, this.xaxis.range[0] - pad), this.xaxis.range[1] - this.width + pad);
            y = Math.min(Math.max(y, this.yaxis.range[0] - pad), this.yaxis.range[1] - this.height + pad);
            
            self.bifurcationContainer.x = -x;
            self.bifurcationContainer.y = -y;
            self.imgView.x[0] = self.xaxis.invert(x);
            self.imgView.x[1] = self.xaxis.invert(x + self.width);
            self.imgView.y[0] = self.yaxis.invert(y);
            self.imgView.y[1] = self.yaxis.invert(y + self.height);
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
                    alpha: 4 * res
                }
            });
        }

        ,positionDiagram: function(){

            var self = this
                ,container = this.bifurcationContainer
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
                ,xmin = this.xmin
                ,xmax = this.xmax
                ,xaxis = this.xaxis
                ,yaxis = this.yaxis
                ,container = this.bifurcationContainer
                ,jobs = []
                ;

            // loop over tiles
            for ( var r = rmax; r > rmin; r-- ){
                for ( var x = xmax; x > xmin; x-- ){
                    // define a scope for vars
                    (function(r, x, res){
                        // push a job function into the jobs array
                        jobs.push(function(){

                            var dfd = when.defer();

                            self.on('generated', function( e, data ){

                                var input = data.inputData;
                                var x = xaxis( input.r[0] );
                                var y = yaxis( - input.x[0] );
                                self.off(e.topic, e.handler);

                                setTimeout(function(){
                                    var bifSprite = PIXI.Sprite.fromImage( data.canvas.toDataURL('image/png') );
                                    container.addChild( bifSprite );
                                    bifSprite.width = w;
                                    bifSprite.height = h;
                                    // console.log(x,y, input.r, input.x)
                                    bifSprite.x = x;
                                    bifSprite.y = y;
                                    dfd.resolve( bifSprite );
                                }, 10);
                            });

                            self.generate(
                                w,
                                h,
                                r-1,
                                r,
                                x-1,
                                x,
                                res
                            );

                            return dfd.promise;
                        });
                    })(r, x, this.resolution);
                }
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

            this.rLine.x = this.xaxis(this.equation.r);

            this.equation.on('next', function( e, val ){
                self.marker.x = self.rLine.x;
                self.marker.y = self.yaxis( val );
            });
        }

    }, ['events']);

    return new Mediator();
});
