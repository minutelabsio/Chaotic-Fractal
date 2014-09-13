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

            this.rmin = 3.3;
            this.rmax = 4;
            this.xmin = 0;
            this.xmax = 1;
            this.zoom = 1;
            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.width = window.innerWidth;
            this.height = window.innerWidth * 9/16;

            this.xaxis = Scale([this.rmin, this.rmax], [ 0, this.width ]);
            this.yaxis = Scale([this.xmin, this.xmax], [ this.height, 0 ]);

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

            $(function(){
                self.onDomReady();
                self.resolve('domready');
            });
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

        ,generate: function( w, h, rmin, rmax, xmin, xmax, scale ){

            var self = this;
            var worker = this.worker;
            var canvas = this.tmpCanvas;
            var ctx = this.tmpCtx;
            var img = ctx.createImageData( w, h );

            // console.time('Create');
            // console.log(w, h, rmin, rmax, xmin, xmax)
            worker.postMessage({
                method: 'bifurcation',
                img: img,
                skip: 0,
                keep: h * scale,
                r: [ rmin, rmax ],
                x: [ xmin, xmax ],
                iterations: 10000,

                color: {
                    r: 10,
                    g: 10,
                    b: 10,
                    alpha: 8
                }
                // color: {
                //     r: 7,
                //     g: 147,
                //     b: 186,
                //     alpha: 2
                // }
            });
        }

        // DomReady Callback
        ,onDomReady: function(){

            var self = this;
            var stage = this.stage;
            var chart = document.getElementById( 'chart' );
            var w = this.renderer.width;
            var h = this.renderer.height;
            var rmin = this.rmin;
            var rmax = this.rmax;
            var xmin = this.xmin;
            var xmax = this.xmax;
            var imageScale = 1;
            var scaleCorrection = imageScale;
            var bifSprite;
            var container = this.bifurcationContainer;
            container.x = w/2;
            container.y = h/2;

            $(chart).append( this.renderer.view );

            self.on('generated', function( e, data ){

                setTimeout(function(){
                    if ( !bifSprite ){
                        bifSprite = PIXI.Sprite.fromImage( data.canvas.toDataURL('image/png') );
                        container.addChild( bifSprite );
                        bifSprite.width = w;
                        bifSprite.height = h;
                        bifSprite.anchor.x = 0.5;
                        bifSprite.anchor.y = 0.5;
                        scaleCorrection = imageScale;
                    } else {
                        bifSprite.setTexture( PIXI.Texture.fromImage( data.canvas.toDataURL('image/png') ) );
                        scaleCorrection = imageScale;
                    }
                },10);
            });

            self.on('zoom', function( e, zoom ){
                var scale = Math.pow( 2, zoom - 1 );

                if ( bifSprite ){
                    bifSprite.width = w * scale / scaleCorrection;
                    bifSprite.height = h * scale / scaleCorrection;

                    if ( scale > 1.75 * imageScale ){
                        imageScale = Math.floor( scale ) + 1;
                        var wa = rmax - rmin;
                        var dr = (wa - wa / imageScale) * 0.5;
                        var wx = xmax - xmin;
                        var dx = (wx - wx / imageScale) * 0.5;

                        self.generate( 2*w, 2*h, rmin + dr, rmax - dr, xmin + dx, xmax - dx, imageScale );
                    }
                }
            });

            self.generate( 2*w, 2*h, rmin, rmax, xmin, xmax, imageScale );

            this.equation = Equation({
                el: '#equation'
            });

            self.rLine.x = this.xaxis(this.equation.r);

            this.equation.on('next', function( e, val ){
                self.marker.x = self.rLine.x;
                self.marker.y = self.yaxis( val );
            });
        }

    }, ['events']);

    return new Mediator();
});
