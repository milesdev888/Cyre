(function(){
  var row = document.querySelector('.cta-row');
  if (!row) return;
  function add(href, label, cls){
    var a = document.createElement('a');
    a.href = href;
    var b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    a.appendChild(b);
    row.appendChild(a);
  }
  add('/check.html', 'Check an address', 'btn b-ghost');
  add('/score', 'Grade your wallet', 'btn b-ghost');
})();
