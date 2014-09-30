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

            this.$el = $(options.el).first();
            this.$main = this.$el.find('.main');

            this.$r = this.$el.find('.r');
            this.$xsPlace = this.$el.find('.x-input');
            this.$outPlace = this.$el.find('.output');

            this.setX(options.x || 0.5);
            this.setR(options.r || 3.5);

            this.doAnimation = (options.animate === undefined) || !!options.animate;

            this.$inLeft = this.box( this.$xsPlace.eq(0), this.x );
            this.$inRight = this.box( this.$xsPlace.eq(1), this.x );
            this.$outBox = this.box( this.$outPlace, this.calc() );
            this.$outBox.css('width', 'auto');

            this.on('set:x', function( e, x ){
                clearTimeout(self._to);
                self.setBoxVal( self.$inLeft, self.x );
                self.setBoxVal( self.$inRight, self.x );
                self.setBoxVal( self.$outBox, self.calc() );
            });

            this.on('set:r', function(){
                clearTimeout(self._to);
            });

            // setInterval(function(){
            //     self.next();
            // }, 4000);
        }

        ,setX: function( x ){
            this.x = x;
            this.emit('set:x', x);
        }

        ,setR: function( r ){
            this.r = r;
            this.$r.text( r );
            this.emit('set:r', r);
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

        ,setBoxVal: function( $box, text ){

            var isLong;

            if ( text === 'Infinity' ){
                text = '&infin;';
                isLong = false;
            } else if ( text === '-Infinity' ){
                text = '-&infin;';
                isLong = false;
            } else {
                if ( Math.abs(+text) > 100 ){

                    text = (+text).toPrecision( 1 );
                } else if ( Math.abs(+text) < 0.0001 ){

                    text = '0';
                }

                isLong = ((''+text).length > 5);
            }

            $box.html( text ).show().toggleClass('long', isLong);
            return $box;
        }

        ,box: function( $place, text ){

            var $box = $('<span>')
                ,pos = this.getPos( $place )
                ;

            return this.setBoxVal( $box.addClass('box'), text )
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
                ,anim = self.doAnimation
                ,val
                ;

            if ( !anim ){
                this.x = parseFloat(this.$outBox.text());
                val = this.calc();
                self.setBoxVal( this.$inLeft.add(this.$inRight), this.x );
                self.setBoxVal( this.$outBox, val );
                self.emit('next', val);
                return;
            }

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

            this.x = parseFloat(this.$outBox.text());
            val = self.calc();
            this.$outBox = this.box( self.$outPlace, val ).hide();

            this._to = setTimeout(function(){
                self.$outBox.show().css('width', 'auto');
                self.emit('next', val);
            }, 1000);
        }
    }, ['events']);

    return Module;
});
