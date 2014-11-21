Package.describe({
    name: 'zakm:csp',
    summary: 'CSP channels for Javascript',
    version: '0.1.0',
    git: 'https://github.com/zakm/meteor-csp'
});

Package.onUse(function(api) {
    api.versionsFrom('1.0');
    api.addFiles( 'csp.js', ['client','server'] );
    api.export( 'csp', ['server','client'] );
});
