Keystroke Logging Plug-in for CKEditor 4
==================================================

## Development Code

This repository contains the development version of the keystrokelog
plug-in for CKEditor.

**Attention:** This repository includes a fork of CKEditor v4.4.7 dev repo.
I've created a branch called ```keystrokelog```. The ```keystrokelog``` plug
in is in the ```plugins\ksytrokelog``` folder.

### Plugin Installation

 - Make sure ```keystrokelog``` is in the ```\\plugins``` folder
 - Edit ```config.js``` to make sure ```keystrokelog``` is in the plugin list.
 - restart or refresh the CKeditor


### Testing

Trun on the javascript console, and you should see logs like:

```
logit: t=2343 ONKEYDOWN {.....}
```


### License

Licensed under the LGPL license.

For full details about the license, please check the LICENSE.md file.
