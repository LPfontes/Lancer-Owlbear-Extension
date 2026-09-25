# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/setup/](https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/setup/)

---

# Setup the Project

To streamline project setup we're going to use the [hello world](/extensions/tutorial-hello-world/create-your-site) tutorial as a base.

Either complete that project or download the source code from [GitHub](https://github.com/owlbear-rodeo/sdk-tutorials/blob/main/hello-world).

Rename the project to folder `initiative-tracker` and open the folder in a code editor.

## Edit the Manifest

To change how our extension looks in Owlbear Rodeo edit the manifest in the public folder.

public/manifest.json
[code]
    {  
      "name": "Initiative Tracker",  
      "version": "1.0.0",  
      "manifest_version": 1,  
      "action": {  
        "title": "Initiative Tracker",  
        "icon": "/icon.svg",  
        "popover": "/",  
        "height": 600,  
        "width": 400  
      }  
    }  
    
[/code]

## Run the Project

To run the project open a terminal and run:
[code]
    $ npm install  
    $ npm run dev  
    
[/code]

Now install your extension in Owlbear Rodeo by following [these steps](/extensions/tutorial-hello-world/install-your-extension).