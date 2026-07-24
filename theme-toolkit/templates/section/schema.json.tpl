{
  "name": "t:sections.@@NAME@@.name",
  "tag": "section",
  "class": "section",
  "settings": [
    {
      "type": "inline_richtext",
      "id": "subheading",
      "label": "t:sections.@@NAME@@.settings.subheading.label"
    },
    {
      "type": "text",
      "id": "heading",
      "label": "t:sections.@@NAME@@.settings.heading.label"
    },
    {
      "type": "richtext",
      "id": "description",
      "label": "t:sections.@@NAME@@.settings.description.label"
    },
    {
      "type": "text_alignment",
      "id": "heading_alignment",
      "default": "left",
      "label": "t:sections.@@NAME@@.settings.heading_alignment.label"
    },
@@IF:IMAGE@@
    {
      "type": "image_picker",
      "id": "image",
      "label": "t:sections.@@NAME@@.settings.image.label",
      "info": "t:sections.@@NAME@@.settings.image.info"
    },
@@ENDIF@@
    {
      "type": "header",
      "content": "t:sections.@@NAME@@.settings.header__layout.content"
    },
    {
      "type": "color_scheme",
      "id": "color_scheme",
      "default": "scheme-1",
      "label": "t:sections.@@NAME@@.settings.color_scheme.label"
    },
    {
      "type": "range",
      "id": "padding_top",
      "min": 0,
      "max": 100,
      "step": 4,
      "unit": "px",
      "default": 36,
      "label": "t:sections.@@NAME@@.settings.padding_top.label"
    },
    {
      "type": "range",
      "id": "padding_bottom",
      "min": 0,
      "max": 100,
      "step": 4,
      "unit": "px",
      "default": 36,
      "label": "t:sections.@@NAME@@.settings.padding_bottom.label"
    }
  ],
@@IF:BLOCKS@@
  "blocks": [
    {
      "type": "@@BLOCK@@",
      "name": "t:sections.@@NAME@@.blocks.@@BLOCK@@.name",
      "settings": [
@@IF:IMAGE@@
        {
          "type": "image_picker",
          "id": "image",
          "label": "t:sections.@@NAME@@.blocks.@@BLOCK@@.settings.image.label"
        },
@@ENDIF@@
        {
          "type": "text",
          "id": "heading",
          "label": "t:sections.@@NAME@@.blocks.@@BLOCK@@.settings.heading.label"
        },
        {
          "type": "richtext",
          "id": "text",
          "label": "t:sections.@@NAME@@.blocks.@@BLOCK@@.settings.text.label"
        }
      ]
    }
  ],
  "max_blocks": 12,
@@ENDIF@@
  "presets": [
    {
      "name": "t:sections.@@NAME@@.presets.name"@@IF:BLOCKS@@,@@ENDIF@@
@@IF:BLOCKS@@
      "blocks": [
        { "type": "@@BLOCK@@" },
        { "type": "@@BLOCK@@" },
        { "type": "@@BLOCK@@" }
      ]
@@ENDIF@@
    }
  ]
}
