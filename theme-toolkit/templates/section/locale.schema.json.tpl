{
  "name": "@@ROLE@@",
  "settings": {
    "subheading": {
      "label": "Subheading"
    },
    "heading": {
      "label": "Heading"
    },
    "description": {
      "label": "Description"
    },
    "heading_alignment": {
      "label": "Heading alignment"
    },
@@IF:IMAGE@@
    "image": {
      "label": "Image",
      "info": "Recommended 1500 x 1000 px. Leave empty to show a placeholder."
    },
@@ENDIF@@
    "header__layout": {
      "content": "Layout"
    },
    "color_scheme": {
      "label": "Color scheme"
    },
    "padding_top": {
      "label": "Top padding"
    },
    "padding_bottom": {
      "label": "Bottom padding"
    }
  },
@@IF:BLOCKS@@
  "blocks": {
    "@@BLOCK@@": {
      "name": "@@BLOCK_LABEL@@",
      "settings": {
@@IF:IMAGE@@
        "image": {
          "label": "Image"
        },
@@ENDIF@@
        "heading": {
          "label": "Heading"
        },
        "text": {
          "label": "Text"
        }
      }
    }
  },
@@ENDIF@@
  "presets": {
    "name": "@@ROLE@@"
  }
}
