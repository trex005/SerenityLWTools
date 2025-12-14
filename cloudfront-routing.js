function getURLSearchParamsString(querystring) {
    var str = [];
    for (var param in querystring) {
        var query = querystring[param];
        var multiValue = query.multiValue;
        if (multiValue) {
            str.push(multiValue.map((item) => param + '=' + item.value).join('&'));
        } else if (query.value === '') {
            str.push(param);
        } else {
            str.push(param + '=' + query.value);
        }
    }
    return str.join('&');
}
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var queryStringValue = request.querystring ? getURLSearchParamsString(request.querystring) : '';
  var qs = queryStringValue ? '?' + queryStringValue : '';
  // Serve the SPA shell for tip deep links without redirecting
  if (uri.startsWith('/t/')) {
    request.uri = '/index.html';
    return request;
  }
  // If the URI ends with a slash, append index.html
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
    return request;
  }
  // If the URI has no extension and does not end with a slash, redirect to add slash
  if (!uri.includes('.') && !uri.endsWith('/')) {
    return {
      statusCode: 307,
      statusDescription: 'Temporary Redirect',
      headers: {
        location: { value: uri + '/' + qs},
        'cache-control': { value: 'no-cache, no-store, must-revalidate' },
        pragma: { value: 'no-cache' },
        expires: { value: '0' }
      }
    };
  }
  return request;
}
