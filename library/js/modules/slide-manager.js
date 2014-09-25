define([
    'jquery',
    'moddef',
    'hammerjs',
    'vendor/raf',
    'tween'
], function(
    $,
    M,
    Hammer,
    _raf,
    TWEEN
) {
    'use strict';

    function animate(time) {

        window.requestAnimationFrame( animate ); // js/RequestAnimationFrame.js needs to be included too.
        TWEEN.update(time);
    }

    animate();

    var Module = M({
        constructor: function( options ){

            var self = this;

            this.$el = $(options.el);
            this.$slides = this.$el.find('section');

            this.initEvents();
            this.resize();
            this.page = this.getClosestPage();
        }

        ,initEvents: function(){
            var self = this;

            // resizing
            $(window).on('resize', function(){
                self.resize();
            });

            // swiping
            var mc = Hammer( this.$el[0] );
            mc.on('panend', function( e ){
                if ( e.velocityY > 0.5 ){
                    self.goto('next');
                } else if ( e.velocityY < -0.5 ){
                    self.goto('prev');
                } else {
                    self.goto('nearest');
                }
            });
            this.$el.on('mousewheel', function( e ){
                if ( self.tween ){
                    e.preventDefault();
                    return;
                }
                if ( e.originalEvent.deltaY > 0 ){
                    self.goto('next');
                } else {
                    self.goto('prev');
                }
            });
        }

        ,getClosestPage: function(){

            var pos = $(document).scrollTop();
            pos -= this.$el.offset().top;
            pos /= window.innerHeight;
            return Math.round( pos );
        }

        ,goto: function( page ){
            var self = this;

            if ( page === 'next' ){
                page = this.page + 1;
            } else if ( page === 'prev' ){
                page = this.page - 1;
            } else if ( page === 'nearest' ){
                page = this.getClosestPage();
            }

            page = Math.max(0, Math.min(this.$slides.length - 1, page));
            this.page = page;

            var pos = this.$slides.eq( page ).offset().top;
            var $doc = $(document);

            if ( self.tween ){
                self.tween.stop();
            }
            self.tween = new TWEEN.Tween({ pos: $doc.scrollTop() })
                .to({ pos: pos }, 1000)
                .easing( TWEEN.Easing.Quadratic.Out )
                .onUpdate(function() {

                    $doc.scrollTop( this.pos );

                })
                .onComplete(function(){
                    self.tween = null;
                })
                .start()
                ;
        }

        ,resize: function(){
            var self = this;

            this.$slides.height( window.innerHeight );
        }

    }, ['events']);

    return Module;
});
