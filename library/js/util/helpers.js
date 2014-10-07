define(function(){
    'use strict';

    var now = window.performance && window.performance.now ?
        function(){ return window.performance.now(); } :
        Date.now && Date.now.bind(Date) || function(){ return (new Date()).getTime(); };

    var frameCallbacks = [];
    var lastTime = now();
    function frame(){

        window.requestAnimationFrame( frame );

        var fn;
        var time = now();
        var dt = time - lastTime;
        for ( var i = 0, l = frameCallbacks.length; i < l; i++ ){

            fn = frameCallbacks[ i ];
            if ( fn.remove ){
                frameCallbacks.splice( i, 1 );
                fn = null;
                i--;
                l--;
            }
            if ( fn ){
                fn( dt );
            }
        }
        lastTime = time;
    }

    frame();

    return {

        now: now

        ,Interval: function( duration, fn, scope ){

            var cumulTime = 0
                ,paused = false
                ,interval = {
                    fn: fn
                    ,scope: scope
                }
                ;

            function check( dt ){

                if ( paused ){
                    return;
                }

                cumulTime += dt;

                if ( cumulTime > interval.duration ){
                    cumulTime = 0;
                    interval.fn.call( interval.scope || window );
                }
            }

            interval.duration = duration;
            interval.refresh = function(){
                cumulTime = 0;
                return interval;
            };
            interval.pause = function( val ){
                paused = (val === undefined) || !!val;
                return interval;
            };
            interval.resume = function(){
                paused = false;
                return interval;
            };
            interval.destroy = function(){
                check.remove = true;
                paused = true;
                interval.resume = interval.pause = null;
            };

            frameCallbacks.push( check );

            return interval;
        }

        ,lerp: function(a, b, p) {
            return (b-a)*p + a;
        }

        ,gauss: function( mean, stddev ){
            var r = 2 * (Math.random() + Math.random() + Math.random()) - 3;
            return r * stddev + mean;
        }

        ,debounce: function( fn, delay ){

            var to
                ,self
                ,args
                ,cb = function(){
                    fn.apply( self, args );
                }
                ;

            return function(){
                self = this;
                args = arguments;
                clearTimeout( to );
                to = setTimeout( cb, delay );
            };
        }

        ,throttle: function( fn, delay, scope ){
            var to
                ,call = false
                ,args
                ,cb = function(){
                    clearTimeout( to );
                    if ( call ){
                        call = false;
                        to = setTimeout(cb, delay);
                        fn.apply(scope, args);
                    } else {
                        to = false;
                    }
                }
                ;

            scope = scope || null;

            return function(){
                call = true;
                args = arguments;
                if ( !to ){
                    cb();
                }
            };
        }

        ,adjustAlpha: function( color, alpha ){
            color = color.split(/[\(,\)]/);
            color.pop();
            color[4] = alpha;
            var type = color.shift().split('a')[0] + 'a';
            return type+'('+ color.join(',') +')';
        }
    };
});
