# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/theme/](https://docs.owlbear.rodeo/extensions/apis/theme/)

---

# Theme

## `OBR.theme`

The theme API gives you access to the current theme used by Owlbear Rodeo.

# Reference

## Methods

### `getTheme`
[code]
    async getTheme()  
    
[/code]

Get the current Owlbear Rodeo theme.

Returns a Theme object.

* * *

### `onChange`
[code]
    onChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (theme: Theme) => void| A callback for when the current theme changes  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onChange` event with a React `useEffect`.  
     * `onChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.theme.onChange((theme) => {  
          // React to theme changes  
        }),  
      []  
    );  
    
[/code]

* * *

## Type Definitions

### Theme

The palette of a theme

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
mode| "DARK" | "LIGHT"| The color mode of the theme  
primary| ThemeColor| The primary color of the theme  
secondary| ThemeColor| The secondary color of the theme  
background| ThemeBackground| The background color of the theme  
text| ThemeText| The text color of the theme  
  
* * *

### ThemeColor

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
main| string| The main color  
light| string| A lightened version of the main color  
dark| string| A darkened version of the main color  
contrastText| string| A text color that contrasts with the main color  
  
* * *

### ThemeBackground

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
default| string| The base background color  
paper| string| A highlight background color used for raised background elements  
  
* * *

### ThemeText

TYPE  
---  
object  
  
**Properties**

NAME| TYPE| DESCRIPTION  
---|---|---  
primary| string| The primary text color  
secondary| string| A secondary text color that recedes compared to the primary text  
disabled| string| A disabled text color used for disabled elements  
  
* * *