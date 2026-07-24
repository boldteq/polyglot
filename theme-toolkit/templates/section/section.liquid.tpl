{{ 'section-@@NAME@@.css' | asset_url | stylesheet_tag }}

{%- style -%}
  .section-{{ section.id }}-padding {
    padding-top: {{ section.settings.padding_top | times: 0.75 | round: 0 }}px;
    padding-bottom: {{ section.settings.padding_bottom | times: 0.75 | round: 0 }}px;
  }

  @media screen and (min-width: 750px) {
    .section-{{ section.id }}-padding {
      padding-top: {{ section.settings.padding_top }}px;
      padding-bottom: {{ section.settings.padding_bottom }}px;
    }
  }
{%- endstyle -%}

<div class="@@NAME@@ color-{{ section.settings.color_scheme }} gradient">
  <div class="page-width section-{{ section.id }}-padding">
    <div class="@@NAME@@__header @@NAME@@__header--{{ section.settings.heading_alignment }}">
      {%- if section.settings.subheading != blank -%}
        <p class="@@NAME@@__subheading">{{ section.settings.subheading }}</p>
      {%- endif -%}

      {%- if section.settings.heading != blank -%}
        <h2 class="@@NAME@@__heading inline-richtext">{{ section.settings.heading }}</h2>
      {%- endif -%}

      {%- if section.settings.description != blank -%}
        <div class="@@NAME@@__description rte">{{ section.settings.description }}</div>
      {%- endif -%}
    </div>
@@IF:IMAGE@@

    <div class="@@NAME@@__media">
      {%- if section.settings.image != blank -%}
        {{
          section.settings.image
          | image_url: width: 1500
          | image_tag:
            loading: 'lazy',
            widths: '275, 550, 710, 1100, 1500',
            sizes: '(min-width: 750px) 50vw, calc(100vw - 3rem)',
            class: '@@NAME@@__image'
        }}
      {%- else -%}
        {{ 'image' | placeholder_svg_tag: 'placeholder-svg @@NAME@@__image' }}
      {%- endif -%}
    </div>
@@ENDIF@@
@@IF:BLOCKS@@

    {%- if section.blocks.size > 0 -%}
      <ul class="@@NAME@@__list list-unstyled" role="list">
        {%- for block in section.blocks -%}
          <li class="@@NAME@@__item" {{ block.shopify_attributes }}>
@@IF:IMAGE@@
            {%- if block.settings.image != blank -%}
              {{
                block.settings.image
                | image_url: width: 1100
                | image_tag:
                  loading: 'lazy',
                  widths: '275, 550, 710, 1100',
                  sizes: '(min-width: 750px) 33vw, calc(100vw - 3rem)',
                  class: '@@NAME@@__item-image'
              }}
            {%- else -%}
              {{ 'image' | placeholder_svg_tag: 'placeholder-svg @@NAME@@__item-image' }}
            {%- endif -%}
@@ENDIF@@

            {%- if block.settings.heading != blank -%}
              <h3 class="@@NAME@@__item-heading">{{ block.settings.heading }}</h3>
            {%- endif -%}

            {%- if block.settings.text != blank -%}
              <div class="@@NAME@@__item-text rte">{{ block.settings.text }}</div>
            {%- endif -%}
          </li>
        {%- endfor -%}
      </ul>
    {%- endif -%}
@@ENDIF@@
  </div>
</div>

{% schema %}
@@SCHEMA@@
{% endschema %}
