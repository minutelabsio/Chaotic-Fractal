define([
    'jquery',
    'moddef',
    'd3',
    'tween',
    'pixi',
    'util/helpers'
], function(
    $,
    M,
    d3,
    TWEEN,
    PIXI,
    helpers
) {
    'use strict';

    var Module = M({

        constructor: function( options ){

            var w = options.width || 200;
            var h = options.height || 200;

            this.$el = $(options.el).css('position', 'relative');
            this.pointSize = options.pointSize || 1;
            this.color = options.color || '#333';
            this.lineColor = options.lineColor || 0xcc0000;

            this.scales = {
                x: d3.scale.linear()
                ,y: d3.scale.linear()
            };

            this.canvas = $('<canvas>').css('position', 'absolute').css('zIndex', 1).appendTo( this.$el )[0];
            this.ctx = this.canvas.getContext('2d');

            if ( window.Modernizr.touch ){
                this.renderer = new PIXI.CanvasRenderer(w, h, null, true);
            } else {
                this.renderer = PIXI.autoDetectRenderer(w, h, null, true);
            }
            this.stage = new PIXI.Stage(0x000000);
            this.$el.append( $(this.renderer.view).css('position', 'absolute').css('zIndex', 2) );
            this.$el.find('canvas').css('top', 0).css('left', 0);

            this.circle = new PIXI.Graphics();
            this.circle.lineStyle( 1, this.lineColor );
            this.circle.drawCircle( 0, 0, 10 );
            this.circle.position.set( -10, -10 );
            this.stage.addChild( this.circle );

            this.resize( w, h );
        }

        ,resize: function( w, h ){
            this.width = w;
            this.height = h;
            this.canvas.width = w;
            this.canvas.height = h;

            this.$el.width( w ).height( h );
            this.renderer.resize( w, h );
            this.scales.x.range([0, w]);
            this.scales.y.range([0, h]);
        }

        ,render: function(){

            this.renderer.render( this.stage );
        }

        ,crosshair: function( x, y, t ){

            t = t || 1000;
            x = this.scales.x( x );
            y = this.scales.y( y );

            var stage = this.stage
                ,r = 10
                ,c = this.lineColor
                ,dx = Math.max( x, this.width - x )
                ,dy = Math.max( y, this.height - y )
                ,start = {
                    left: x - dx
                    ,right: x + dx
                    ,top: y - dy
                    ,bottom: y + dy
                }
                ,end = {
                    left: x - r
                    ,right: x + r
                    ,top: y - r
                    ,bottom: y + r
                }
                ;

            var g = new PIXI.Graphics();
            stage.addChild( g );

            var tween = new TWEEN.Tween( $.extend({}, start) )
                .to( end, t/2|0 )
                .onUpdate(function(){

                    g.clear();
                    g.lineStyle( 1, c );
                    // left
                    g.moveTo( start.left, y );
                    g.lineTo( this.left, y );
                    // right
                    g.moveTo( start.right, y );
                    g.lineTo( this.right, y );
                    // top
                    g.moveTo( x, start.top );
                    g.lineTo( x, this.top );
                    // bottom
                    g.moveTo( x, start.bottom );
                    g.lineTo( x, this.bottom );
                })
                .onComplete(function(){
                    new TWEEN.Tween({ o: 1 })
                        .to({ o: 0 }, t/2|0).onUpdate(function(){
                            g.alpha = this.o;
                        })
                        .onComplete(function(){
                            stage.removeChild( g );
                        })
                        .start()
                        ;
                })
                .start()
                ;
        }

        ,plot: function( x, y, noscale ){

            var ctx = this.ctx;

            if ( !noscale ){
                x = this.scales.x( x );
                y = this.scales.y( y );
            }

            this.circle.x = x;
            this.circle.y = y;

            ctx.lineWidth = 0;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(x, y, this.pointSize, 0, Math.PI * 2, false);
            ctx.closePath();
            ctx.fill();
        }

    }, ['events']);

    return Module;
});
