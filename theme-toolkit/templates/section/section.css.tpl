/* section-@@NAME@@.css — @@ROLE@@
 *
 * Colour binds to the active scheme via rgb(var(--color-*)) only. Type sizing is deliberately
 * absent: use the theme's own heading classes so this section inherits the locked type scale
 * instead of forking it.
 */

.@@NAME@@__header {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-bottom: 3.2rem;
}

/* Alignment is a MODIFIER CLASS, never an inline style — an inline style cannot be overridden by
 * the theme's own responsive rules and cannot be re-themed per breakpoint. */
.@@NAME@@__header--left {
  align-items: flex-start;
  text-align: left;
}

.@@NAME@@__header--center {
  align-items: center;
  text-align: center;
}

.@@NAME@@__header--right {
  align-items: flex-end;
  text-align: right;
}

.@@NAME@@__subheading {
  color: rgb(var(--color-foreground));
  letter-spacing: 0.1rem;
  margin: 0;
  opacity: 0.75;
  text-transform: uppercase;
}

.@@NAME@@__heading {
  color: rgb(var(--color-foreground));
  margin: 0;
}

.@@NAME@@__description {
  color: rgb(var(--color-foreground));
  max-width: 62ch;
}

.@@NAME@@__header--center .@@NAME@@__description {
  margin-inline: auto;
}
@@IF:IMAGE@@

.@@NAME@@__media {
  margin-top: 2.4rem;
  overflow: hidden;
}

.@@NAME@@__image {
  display: block;
  height: auto;
  width: 100%;
}
@@ENDIF@@
@@IF:BLOCKS@@

.@@NAME@@__list {
  display: grid;
  gap: 2.4rem;
  grid-template-columns: 1fr;
  margin: 2.4rem 0 0;
  padding: 0;
}

@media screen and (min-width: 750px) {
  .@@NAME@@__list {
    grid-template-columns: repeat(3, 1fr);
  }
}

.@@NAME@@__item {
  background-color: rgb(var(--color-background));
  color: rgb(var(--color-foreground));
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
@@IF:IMAGE@@

.@@NAME@@__item-image {
  display: block;
  height: auto;
  width: 100%;
}
@@ENDIF@@

.@@NAME@@__item-heading {
  color: rgb(var(--color-foreground));
  margin: 0;
}

.@@NAME@@__item-text {
  color: rgb(var(--color-foreground));
}

.@@NAME@@__item-text > :last-child {
  margin-bottom: 0;
}
@@ENDIF@@
