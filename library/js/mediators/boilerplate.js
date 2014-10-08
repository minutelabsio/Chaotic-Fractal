define([
    'jquery',
    'jquery.nouislider',
    'moddef',
    'util/helpers',
    'hammerjs',
    'modules/logical-map-equation',
    'modules/slide-manager',
    'modules/bifurcation-map'
], function(
    $,
    _jqnoui,
    M,
    helpers,
    Hammer,
    Equation,
    SlideManager,
    BifurcationChart
) {
    'use strict';

    // Page-level Mediator
    var Mediator = M({

        // Mediator Constructor
        constructor: function(){

            var self = this;

            this.chart = BifurcationChart();

            $(function(){
                self.onDomReady();
                self.resolve('domready');
            });

            // this.emit('resize');
        }

        // DomReady Callback
        ,onDomReady: function(){

            var self = this;
            var vals = { x: 0.5, r: 3.3 };

            $('#chart').append( this.chart.$chart );
            this.chart.resize();

            this.slides = SlideManager({
                el: '#story'
            });

            $(document).on('click touchstart', '#story .btn-continue', function(e){
                // e.preventDefault();
                self.slides.goto('next');
            });

            this.equation = Equation({
                el: '.chart-slide .moving-equation'
                ,x: vals.x
                ,r: vals.r
                // ,animate: false
            });

            self.chart.setR(this.equation.r);

            this.chart.on('change:r', function( e, r ){
                self.equation.setR( r );
            });

            this.equation.on('next', function( e, val ){
                var y = self.chart.yaxis( val );
                self.chart.markerAt( self.chart.rLine.x, y );
            });

            // sliders
            var $slide1 = $('.slide1');
            var $slide1XInputs = $slide1.find('.x-input');
            var $slide2 = $('.slide2');
            var $slide2XInputs = $slide2.find('.x-input');
            var $slide2RInput = $slide2.find('.r');
            var $chartSlide = $('.chart-slide');

            $slide1.find('.eq-demo .slider').noUiSlider({
                start: vals.x
                ,connect: 'lower'
                ,range: {
                    min: 0.01
                    ,max: 0.99
                }
            }).on('set slide', function(){
                var val = $(this).val();
                vals.x = val;
                $slide1XInputs.html( val );
                $slide2XInputs.html( val );
            });

            $slide2.find('.eq-demo .slider').noUiSlider({
                start: vals.r
                ,connect: 'lower'
                ,range: {
                    min: 3
                    ,max: 3.99
                }
            }).on('set slide', function(){
                var val = $(this).val();
                vals.r = val;
                $slide2RInput.html( val );
            });

            var eqn = Equation({
                el: '.slide3 .moving-equation'
                ,x: vals.x
                ,r: vals.r
            });

            // equation animation tickers
            var ticker1 = helpers.Interval( 3000, function(){
                eqn.next();
            });
            ticker1.pause( this.slides.page !== 2 );

            var ticker2 = helpers.Interval( 3000, function(){
                self.equation.next();
            });
            ticker2.pause( this.slides.page !== 4 );

            self.chart.on('set:x', function( e, x ){
                self.equation.$inLeft.hide();
                self.equation.$inRight.hide();
                self.equation.setBoxVal(self.equation.$outBox.show(), x);
                self.equation.emit('next', x);
                ticker2.refresh();
            });

            // turn on/off equations when slides change to correct page
            this.slides.on('changing', function( e, pages ){
                if ( pages.next === 2 || pages.next === 4 ){
                    eqn.setR( vals.r );
                    eqn.setX( vals.x );
                    self.equation.setR( vals.r );
                    self.equation.setX( vals.x );
                    self.chart.setR( vals.r );
                }
            }).on('page', function( e, page ){
                ticker1.pause( page !== 2 );
                ticker2.pause( page !== 4 );
            });


            $chartSlide.find('.slider').noUiSlider({
                start: Math.exp(1)
                ,connect: 'lower'
                ,range: {
                    min: 1
                    ,max: Math.exp(4 - 0.06)
                }
            }).on('set slide', function(){
                var val = 4000 - (Math.log($(this).val())*1000)|0;
                self.equation.doAnimation = ( val > 1000 )
                ticker2.duration = val;
            });

            $('body').removeClass('loading');
            $('html, body').scrollTop(0);

        }

    }, ['events']);

    return new Mediator();
});
