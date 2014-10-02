function Scale( $in, $out ){
    var in0 = $in[0],
        out0 = $out[0],
        a = ($out[1] - out0) / ($in[1] - in0),
        scale;

    scale = function( x ){
        return (x - in0) * a + out0;
    };

    scale.domain = $in;
    scale.range = $out;

    scale.invert = function( y ){
        return (y - out0) / a + in0;
    };

    return scale;
}

function normal( top, bottom ){
    return top;
}

function colorDodge( top, bottom ){
    bottom = bottom || 1;
    return (top >= 255) ? 255 : Math.min(bottom * 255 / (255 - top), 255);
}

function colorBurn( top, bottom ){
    return (top <= 0) ? 0 : Math.max(255 - ((255 - bottom) * 255 / top), 0);
}

function plotPoint( x, y, data, width, color ){

    var floorX = (x|0)
        ,floorY = (y|0)
        ,decX = (x - floorX)
        ,decY = (y - floorY)
        ;

    plotPixel( floorX, floorY, data, width, color, (1 - decX) * (1 - decY) );
    plotPixel( floorX + 1, floorY, data, width, color, decX * (1 - decY) );
    plotPixel( floorX, floorY + 1, data, width, color, (1 - decX) * decY );
    plotPixel( floorX + 1, floorY + 1, data, width, color, decX * decY );
}

function plotPixel( x, y, data, width, color, weight ){

    weight = weight || 1;
    x = x|0;
    y = y|0;

    var filter = colorDodge
        ,idx = (width * y + x) * 4
        ;

    if ( x >= width || idx < 0 || idx >= data.length ){
        return;
    }

    data[ idx ] = filter( color.r, data[ idx ] );
    data[ idx + 1 ] = filter( color.g, data[ idx + 1 ] );
    data[ idx + 2 ] = filter( color.b, data[ idx + 2 ] );
    data[ idx + 3 ] += color.alpha * weight; //filter( 20, data[ idx + 3 ] );
}

function run( r, data, xaxis, yaxis, color, skip, keep ){

    var x = 0.5
        ,i
        ,w = xaxis.range[1]
        ,h = yaxis.range[0] | 0
        ;

    for ( i = 0; i < skip; i++){
        x = r * x * (1-x);
    }

    for ( i = 0; i < keep; i+=2 ){
        x = r * x * (1-x);
        plotPoint( xaxis(r), yaxis(x), data, w, color );
    }
}


function bifurcation( data ){

    var color = data.color
        ,img = data.img
        ,imgData = img.data
        ,width = img.width
        ,height = img.height
        ,skip = data.skip | 0
        ,keep = data.keep | 0
        ,xaxis = Scale(data.r, [ 0, width ])
        ,yaxis = Scale(data.x, [ 0, height ])
        ,r = data.r[0]
        ,max = data.r[1]
        ,precision = (max - r) / data.iterations
        ;

    while ( r <= max ){
        run( r, imgData, xaxis, yaxis, color, skip, keep );
        r += precision;
    }

    return {
        img: data.img
        ,inputData: data
    };
}

function white( data ){
    var l = data.length;
    while ( l-- >= 0 ){
        data[ l ] = 255;
    }
}

// because the library is dumb...
function invertAlpha( data ){
    var l = data.length;
    var i = 0;
    for ( i; i < l; i += 4 ){
        data[ i + 3 ] = 255 - data[ i + 3 ];
    }
}

var fs  = require('fs');
var sys = require('sys');
var Png = require('png').Png;
var Buffer = require('buffer').Buffer;

module.exports = function( path, w, h, bounds ){

    bounds = bounds || {};
    var rmin = bounds.rmin || 3;
    var rmax = bounds.rmax || 4;
    var xmin = bounds.xmin || 1;
    var xmax = bounds.xmax || 0;
    var opts = {
        img: {
            width: w
            ,height: h
            ,data: new Uint8ClampedArray( w * h * 4 )
        },
        skip: 0,
        keep: h,
        r: [ rmin, rmax ],
        x: [ xmin, xmax ],
        iterations: 2 * ((h/720) | 0) * 10000,

        color: {
            r: 10,
            g: 10,
            b: 10,
            alpha: 2
        }
    };

    var ret = bifurcation( opts );
    invertAlpha( ret.img.data );
    var png = new Png(new Buffer(ret.img.data), w, h, 'rgba');
    var pngImage = png.encodeSync();

    fs.writeFileSync(path + 'bifurcation.png', pngImage.toString('binary'), 'binary');
};
