define([
    'jquery',
    'jquery.nouislider',
    'moddef',
    'vendor/raf',
    'tween',
    'util/helpers',
    'hammerjs',
    'modules/point-plotter',
    'modules/logical-map-equation',
    'modules/slide-manager',
    'modules/bifurcation-map'
], function(
    $,
    _jqnoui,
    M,
    _raf,
    TWEEN,
    helpers,
    Hammer,
    PointPlotter,
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

            function tweenupdate(){

                window.requestAnimationFrame( tweenupdate );
                TWEEN.update();
                self.emit('frame');
            }

            tweenupdate();

            // this.emit('resize');
        }

        // DomReady Callback
        ,onDomReady: function(){

            var self = this;
            var vals = { x: 0.5, r: 3.6 };

            $('#chart').append( this.chart.$chart );
            this.chart.resize();

            this.slides = SlideManager({
                el: '#story'
            });

            $(document).on('click', '#story .btn-continue', function(e){
                e.preventDefault();
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
            var $chartSlide = $('.chart-slide');
            var genIdx = $('#story .generator-slide').index();
            var chartIdx = $('#story .chart-slide').index();

            var genChart = PointPlotter({ el: '#guided-chart', width: window.innerWidth, height: window.innerHeight - 320, color: 'rgba(10, 10, 100, 0.6)' });
            genChart.scales.x.domain([1, 5]);
            genChart.scales.y.domain([1, 0]);
            this.on('frame', function(){
                genChart.render();
            });

            $(window).on('resize', function(){
                var w = window.innerWidth;
                var h = window.innerHeight - 320;
                genChart.resize( w, h );
            });

            var eqn = Equation({
                el: '.generator-slide .moving-equation'
                ,x: vals.x
                ,r: 3.99
            });

            var $genRSlider = $('#story .generator-slide .r-slider').noUiSlider({
                start: 399
                ,step: 0.1
                ,connect: 'lower'
                ,range: {
                    min: 1 * 100
                    ,max: 3.99 * 100
                }
            }).on('set slide', function(){
                var r = $(this).val();
                eqn.setR( (r/100).toFixed(3) );
            });

            // equation animation tickers
            var ticker1 = helpers.Interval( 3000, function(){
                eqn.next();
            });
            ticker1.pause( this.slides.page !== genIdx );

            var $genSpeedSlider = $('#story .generator-slide .speed-slider').noUiSlider({
                start: Math.exp(1)
                ,connect: 'lower'
                ,range: {
                    min: 1
                    ,max: Math.exp(4 - 0.06)
                }
            }).on('set slide', function(){
                var val = 4000 - (Math.log($(this).val())*1000)|0;
                eqn.doAnimation = ( val > 1000 )
                ticker1.duration = val;
            });

            eqn.on('next', function( e, x ){
                genChart.plot( eqn.r, x );
                if ( ticker1.duration > 1000 ){
                    genChart.crosshair( eqn.r, x );
                }
            });

            var ticker2 = helpers.Interval( 3000, function(){
                self.equation.next();
            });
            ticker2.pause( this.slides.page !== chartIdx );

            self.chart.on('set:x', function( e, x ){
                self.equation.$inLeft.hide();
                self.equation.$inRight.hide();
                self.equation.setBoxVal(self.equation.$outBox.show(), x);
                self.equation.emit('next', x);
                ticker2.refresh();
            });

            // turn on/off equations when slides change to correct page
            this.slides.on('page', function( e, page ){
                ticker1.pause( page !== genIdx );
                ticker2.pause( page !== chartIdx );
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
            self.slides.page = 0;

        }

    }, ['events']);

    return new Mediator();
});
