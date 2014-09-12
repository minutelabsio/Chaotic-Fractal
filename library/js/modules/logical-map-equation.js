define([
    'jquery',
    'moddef',
    'require',
    'pixi'
], function(
    $,
    M,
    require,
    PIXI
) {
    'use strict';

    var Module = M({
        constructor: function( options ){

            var self = this;
            this.x = options.x || 0.5;

            this.$el = $(options.el);
            this.$main = this.$el.find('.main');

            this.$r = this.$el.find('.r');
            this.$xsPlace = this.$el.find('.x-input');
            this.$outPlace = this.$el.find('.output');

            this.setR(options.r || 3.5);

            this.$inLeft = this.box( this.$xsPlace.eq(0), this.x );
            this.$inRight = this.box( this.$xsPlace.eq(1), this.x );
            this.$outBox = this.box( this.$outPlace, this.calc() );
            this.$outBox.css('width', 'auto');

            setInterval(function(){
                // self.next();
            }, 4000);
        }

        ,setR: function( r ){
            this.r = r;
            this.$r.text( r );
        }

        ,calc: function(){

            return this.r * this.x * ( 1 - this.x );
        }

        ,getPos: function( $place ){

            var pos = $place.offset()
                ,offset = this.$main.offset()
                ;

            pos.top -= offset.top;
            pos.left -= offset.left;
            pos.str = 'translate('+ pos.left +'px,'+ pos.top +'px)';

            return pos;
        }

        ,box: function( $place, text ){

            var $box = $('<span>')
                ,pos = this.getPos( $place )
                ;

            text += '';

            return $box.addClass('box')
                .text( text )
                .toggleClass('long', text.length > 5)
                .css({
                    position: 'absolute'
                    ,top: 0
                    ,left: 0
                    ,transform: pos.str
                })
                .appendTo( this.$main )
                ;
        }

        ,dropOut: function( $els ){

            var self = this;

            $els.each(function(){
                var $this = $(this)
                    ,pos = self.getPos( $this )
                    ;

                pos.top += 100;

                $this.css('transition', 'all 1s ease-in-out')
                    .css({
                        'transform': 'translate('+ pos.left +'px,'+ pos.top +'px)'
                        ,'opacity': 0
                    })
                    ;

                setTimeout(function(){
                    $this.remove();
                }, 1000);
            });
        }

        ,next: function(){

            var self = this
                ,w = self.$xsPlace.width() + 'px'
                ;

            this.dropOut( this.$inLeft.add(this.$inRight) );

            this.$inLeft = this.$outBox;
            this.$inRight = this.box( this.$outPlace, this.$inLeft.text() );
            this.$inRight.css('width', 'auto');

            this.$inLeft.add(this.$inRight)
                .css('width', this.$inLeft.width() + 'px')
                .css('transition', 'all 1s ease-in-out')
                ;

            setTimeout(function(){
                self.$inLeft.css('transform', self.getPos(self.$xsPlace.eq(0)).str).css('width', w);
                self.$inRight.css('transform', self.getPos(self.$xsPlace.eq(1)).str).css('width', w);
            }, 50);

            this.x = this.calc();

            setTimeout(function(){
                self.$outBox = self.box( self.$outPlace, self.calc() );
                self.$outBox.css('width', 'auto');
            }, 1000);
        }
    }, ['events']);

    return Module;
});
