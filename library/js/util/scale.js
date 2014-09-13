define(function(){

    return function( $in, $out ){
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
    };
});
