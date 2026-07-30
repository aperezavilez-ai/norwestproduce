CREATE OR REPLACE FUNCTION norwestproduce.apply_inventory_adjustments(adjustments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = norwestproduce, pg_temp
AS $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT inventory_lot_id, quantity_delta
    FROM jsonb_to_recordset(adjustments) AS value(inventory_lot_id integer, quantity_delta integer)
  LOOP
    UPDATE inventory_lots
    SET available_boxes = available_boxes + item.quantity_delta
    WHERE id = item.inventory_lot_id
      AND organization_code = 'USA'
      AND available_boxes >= GREATEST(0, -item.quantity_delta);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventario insuficiente para lote %', item.inventory_lot_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION norwestproduce.apply_inventory_adjustments(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION norwestproduce.apply_inventory_adjustments(jsonb) TO postgres, service_role;
