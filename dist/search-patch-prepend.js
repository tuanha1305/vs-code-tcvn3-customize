/* TCVN3 SEARCH PATCH v4 BEGIN */
;(function(){
  if (globalThis.__tcvn3SearchEncode) return;
  var MAP={0xC0:"\u0041\u00B5",0xC1:"\u0041\u00B8",0xC2:"\u00A2",0xC3:"\u0041\u00B7",0xC8:"\u0045\u00CC",0xC9:"\u0045\u00D0",0xCA:"\u00A3",0xCC:"\u0049\u00D7",0xCD:"\u0049\u00DD",0xD2:"\u004F\u00DF",0xD3:"\u004F\u00E3",0xD4:"\u00A4",0xD5:"\u004F\u00E2",0xD9:"\u0055\u00EF",0xDA:"\u0055\u00F3",0xDD:"\u0059\u00FD",0xE0:"\u00B5",0xE1:"\u00B8",0xE2:"\u00A9",0xE3:"\u00B7",0xE8:"\u00CC",0xE9:"\u00D0",0xEA:"\u00AA",0xEC:"\u00D7",0xED:"\u00DD",0xF2:"\u00DF",0xF3:"\u00E3",0xF4:"\u00AB",0xF5:"\u00E2",0xF9:"\u00EF",0xFA:"\u00F3",0xFD:"\u00FD",0x102:"\u00A1",0x103:"\u00A8",0x110:"\u00A7",0x111:"\u00AE",0x128:"\u0049\u00DC",0x129:"\u00DC",0x168:"\u0055\u00F2",0x169:"\u00F2",0x1A0:"\u00A5",0x1A1:"\u00AC",0x1AF:"\u00A6",0x1B0:"\u00AD",0x1EA0:"\u0041\u00B9",0x1EA1:"\u00B9",0x1EA2:"\u0041\u00B6",0x1EA3:"\u00B6",0x1EA4:"\u00A2\u00CA",0x1EA5:"\u00CA",0x1EA6:"\u00A2\u00C7",0x1EA7:"\u00C7",0x1EA8:"\u00A2\u00C8",0x1EA9:"\u00C8",0x1EAA:"\u00A2\u00C9",0x1EAB:"\u00C9",0x1EAC:"\u00A2\u00CB",0x1EAD:"\u00CB",0x1EAE:"\u00A1\u00BE",0x1EAF:"\u00BE",0x1EB0:"\u00A1\u00BB",0x1EB1:"\u00BB",0x1EB2:"\u00A1\u00BC",0x1EB3:"\u00BC",0x1EB4:"\u00A1\u00BD",0x1EB5:"\u00BD",0x1EB6:"\u00A1\u00C6",0x1EB7:"\u00C6",0x1EB8:"\u0045\u00D1",0x1EB9:"\u00D1",0x1EBA:"\u0045\u00CE",0x1EBB:"\u00CE",0x1EBC:"\u0045\u00CF",0x1EBD:"\u00CF",0x1EBE:"\u00A3\u00D5",0x1EBF:"\u00D5",0x1EC0:"\u00A3\u00D2",0x1EC1:"\u00D2",0x1EC2:"\u00A3\u00D3",0x1EC3:"\u00D3",0x1EC4:"\u00A3\u00D4",0x1EC5:"\u00D4",0x1EC6:"\u00A3\u00D6",0x1EC7:"\u00D6",0x1EC8:"\u0049\u00D8",0x1EC9:"\u00D8",0x1ECA:"\u0049\u00DE",0x1ECB:"\u00DE",0x1ECC:"\u004F\u00E4",0x1ECD:"\u00E4",0x1ECE:"\u004F\u00E1",0x1ECF:"\u00E1",0x1ED0:"\u00A4\u00E8",0x1ED1:"\u00E8",0x1ED2:"\u00A4\u00E5",0x1ED3:"\u00E5",0x1ED4:"\u00A4\u00E6",0x1ED5:"\u00E6",0x1ED6:"\u00A4\u00E7",0x1ED7:"\u00E7",0x1ED8:"\u00A4\u00E9",0x1ED9:"\u00E9",0x1EDA:"\u00A5\u00ED",0x1EDB:"\u00ED",0x1EDC:"\u00A5\u00EA",0x1EDD:"\u00EA",0x1EDE:"\u00A5\u00EB",0x1EDF:"\u00EB",0x1EE0:"\u00A5\u00EC",0x1EE1:"\u00EC",0x1EE2:"\u00A5\u00EE",0x1EE3:"\u00EE",0x1EE4:"\u0055\u00F4",0x1EE5:"\u00F4",0x1EE6:"\u0055\u00F1",0x1EE7:"\u00F1",0x1EE8:"\u00A6\u00F8",0x1EE9:"\u00F8",0x1EEA:"\u00A6\u00F5",0x1EEB:"\u00F5",0x1EEC:"\u00A6\u00F6",0x1EED:"\u00F6",0x1EEE:"\u00A6\u00F7",0x1EEF:"\u00F7",0x1EF0:"\u00A6\u00F9",0x1EF1:"\u00F9",0x1EF2:"\u0059\u00FA",0x1EF3:"\u00FA",0x1EF4:"\u0059\u00FE",0x1EF5:"\u00FE",0x1EF6:"\u0059\u00FB",0x1EF7:"\u00FB",0x1EF8:"\u0059\u00FC",0x1EF9:"\u00FC"};
  var REGEX_META="\\^$.*+?()[]{}|/-";
  function hex2(b){var s=b.toString(16).toUpperCase();return s.length<2?"0"+s:s;}
  function emitByte(b,inCharClass){
    if (b>=0x80) return "\\x"+hex2(b);
    var ch=String.fromCharCode(b);
    if (REGEX_META.indexOf(ch)!==-1) return "\\"+ch;
    return ch;
  }
  function encodeChar(cp){
    var bytes=MAP[cp];
    if (bytes){
      var out="";
      for (var i=0;i<bytes.length;i++) out+=emitByte(bytes.charCodeAt(i),false);
      return out;
    }
    if (cp<0x80){
      var ch=String.fromCharCode(cp);
      if (REGEX_META.indexOf(ch)!==-1) return "\\"+ch;
      return ch;
    }
    if (cp<0x100) return "\\x"+hex2(cp);
    return String.fromCharCode(cp);
  }
  globalThis.__tcvn3SearchEncode=function(pattern,isRegExp){
    if (typeof pattern!=="string"||pattern.length===0) return {pattern:pattern,isRegExp:isRegExp};
    if (isRegExp){
      // Preserve user regex syntax: only translate non-ASCII chars.
      var out="";
      for (var i=0;i<pattern.length;i++){
        var cp=pattern.charCodeAt(i);
        if (cp<0x80){ out+=pattern[i]; continue; }
        var bytes=MAP[cp];
        if (bytes){ for (var j=0;j<bytes.length;j++) out+="\\x"+hex2(bytes.charCodeAt(j)); }
        else if (cp<0x100) out+="\\x"+hex2(cp);
        else out+=pattern[i];
      }
      return {pattern:out,isRegExp:true};
    }
    // Literal-text mode: encode each char and escape regex metas.
    var out="";
    for (var i=0;i<pattern.length;i++){
      out+=encodeChar(pattern.charCodeAt(i));
    }
    return {pattern:out,isRegExp:true};
  };
})();
/* TCVN3 SEARCH PATCH v4 END */
