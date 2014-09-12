define([
    'jquery',
    'moddef',
    'require',
    'pixi',
    'modules/logical-map-equation'
], function(
    $,
    M,
    require,
    PIXI,
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

            this.zoom = 1;
            this.tmpCanvas = document.createElement('canvas');
            this.tmpCtx = this.tmpCanvas.getContext( '2d' );

            this.renderer = PIXI.autoDetectRenderer(window.innerWidth, window.innerWidth * 9/16, null, true);
			this.stage = new PIXI.Stage(0x000000, true);
			this.stage.setInteractive(true);

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
            var rmin = 3.3;
            var rmax = 4;
            var xmin = 0;
            var xmax = 1;
            var imageScale = 1;
            var scaleCorrection = imageScale;
            var bifSprite;
            var container = new PIXI.DisplayObjectContainer();
            container.x = w/2;
            container.y = h/2;
            stage.addChild( container );

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
        }

    }, ['events']);

    return new Mediator();
});
