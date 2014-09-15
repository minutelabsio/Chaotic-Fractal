define([
    'jquery',
    'moddef',
    'require',
    'pixi',
    'util/scale',
    'modules/logical-map-equation'
], function(
    $,
    M,
    require,
    PIXI,
    Scale,
    Equation
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

            this.imgView = { x: [3.3, 4], y: [0, 1] };
            this.rmin = 3.3;
            this.rmax = 4;
            this.xmin = 0;
            this.xmax = 1;
            this.zoom = 1;
            this.resolution = 2;
            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.width = window.innerWidth;
            this.height = window.innerWidth * 9/16;

            this.xaxis = Scale([this.rmin, this.rmax], [ 0, this.width ]);
            this.yaxis = Scale([this.xmin, this.xmax], [ 0, this.height ]);

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

                self.emit('generated', { canvas: self.tmpCanvas, ctx: self.tmpCtx });
            };

            self.initEvents();
            self.initDiagram();

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


            function setR( e ){
                var pos = e.global;

                self.rLine.x = pos.x;

                if ( self.equation ){
                    self.equation.setR( self.xaxis.invert( pos.x ) );
                }
            }

            // stage
            this.stage.mousedown = setR;
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
                    alpha: 8
                }
            });
        }

        ,positionDiagram: function(){

            var self = this
                ,sprite = this.sprite
                ,xaxis = this.xaxis
                ,yaxis = this.yaxis
                ,res = this.resolution
                ,v = self.imgView
                ;

            var w = this.width;
            var h = this.height;

            sprite.scale.x = w / (xaxis(v.x[1]) - xaxis(v.x[0])) / res;
            sprite.scale.y = h / (yaxis(v.y[1]) - yaxis(v.y[0])) / res;
            sprite.x = - (xaxis(v.x[0])) * sprite.scale.x * res;
            sprite.y = - (yaxis(v.y[0])) * sprite.scale.y * res;
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
                ,bifSprite
                ,container = this.bifurcationContainer
                ;

            // container.x = w/2;
            // container.y = h/2;

            this.on('generated', function( e, data ){

                self.off(e.topic, e.handler);

                setTimeout(function(){
                    bifSprite = PIXI.Sprite.fromImage( data.canvas.toDataURL('image/png') );
                    container.addChild( bifSprite );
                    // bifSprite.width = w;
                    // bifSprite.height = h;
                    // bifSprite.anchor.x = 0.5;
                    // bifSprite.anchor.y = 0.5;
                    self.resolve('sprite-generated', bifSprite);
                }, 10);
            });

            this.after('sprite-generated').then(function( sprite ){
                self.sprite = sprite;
                self.positionDiagram();

                self.on('generated', function(){

                    sprite.setTexture( PIXI.Texture.fromImage( data.canvas.toDataURL('image/png') ) );
                });
            });

            this.generate(
                w,
                h,
                rmin,
                rmax,
                xmin,
                xmax,
                this.resolution
            );
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
