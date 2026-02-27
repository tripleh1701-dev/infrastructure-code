import { Controller, Control, FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { getCountryNames, getStatesForCountry, getCountryByName } from "@/lib/data/countries";
import { getCitiesForState } from "@/lib/data/cities";
import { useMemo } from "react";
import type { AccountFormData } from "@/lib/validations/account";

interface AddressFieldsProps {
  index: number;
  control: Control<AccountFormData>;
  register: UseFormRegister<AccountFormData>;
  errors: FieldErrors<AccountFormData>;
  setValue: UseFormSetValue<AccountFormData>;
  watch: UseFormWatch<AccountFormData>;
}

const countryNames = getCountryNames();

export function AddressFields({ index, control, register, errors, setValue, watch }: AddressFieldsProps) {
  const selectedCountry = watch(`addresses.${index}.country`);
  const selectedState = watch(`addresses.${index}.state`);
  const states = useMemo(() => getStatesForCountry(selectedCountry || ""), [selectedCountry]);
  const countryData = useMemo(() => getCountryByName(selectedCountry || ""), [selectedCountry]);
  const cities = useMemo(() => {
    if (!countryData || !selectedState) return [];
    return getCitiesForState(countryData.code, selectedState);
  }, [countryData, selectedState]);
  const postalCodeLabel = countryData?.postalCodeLabel || "Postal Code";

  return (
    <div className="form-grid">
      <div className="space-y-2 md:col-span-2 sm:col-span-2">
        <Label className="text-sm">Address Line 1 <span className="text-destructive">*</span></Label>
        <Input
          {...register(`addresses.${index}.line1`)}
          placeholder="Street address"
          className={cn("h-10 input-glow", errors.addresses?.[index]?.line1 && "border-destructive")}
        />
        {errors.addresses?.[index]?.line1 && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.addresses[index].line1.message}
          </p>
        )}
      </div>
      <div className="space-y-2 md:col-span-2 sm:col-span-2">
        <Label className="text-sm">Address Line 2</Label>
        <Input
          {...register(`addresses.${index}.line2`)}
          placeholder="Apt, suite, etc. (optional)"
          className="h-10 input-glow"
        />
      </div>

      {/* Country Searchable Dropdown */}
      <div className="space-y-2">
        <Label className="text-sm">Country <span className="text-destructive">*</span></Label>
        <Controller
          name={`addresses.${index}.country`}
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                setValue(`addresses.${index}.state`, "");
                setValue(`addresses.${index}.city`, "");
                setValue(`addresses.${index}.postalCode`, "");
              }}
              options={countryNames}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              emptyMessage="No country found."
              className={cn("h-10", errors.addresses?.[index]?.country && "border-destructive")}
            />
          )}
        />
        {errors.addresses?.[index]?.country && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.addresses[index].country.message}
          </p>
        )}
      </div>

      {/* State Searchable Dropdown */}
      <div className="space-y-2">
        <Label className="text-sm">State / Province <span className="text-destructive">*</span></Label>
        {states.length > 0 ? (
          <Controller
            name={`addresses.${index}.state`}
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onValueChange={(val) => {
                  field.onChange(val);
                  setValue(`addresses.${index}.city`, "");
                }}
                options={states}
                placeholder="Select state"
                searchPlaceholder="Search states..."
                emptyMessage="No state found."
                className={cn("h-10", errors.addresses?.[index]?.state && "border-destructive")}
              />
            )}
          />
        ) : (
          <Input
            {...register(`addresses.${index}.state`)}
            placeholder={selectedCountry ? "Enter state/province" : "Select country first"}
            className={cn("h-10 input-glow", errors.addresses?.[index]?.state && "border-destructive")}
          />
        )}
        {errors.addresses?.[index]?.state && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.addresses[index].state.message}
          </p>
        )}
      </div>

      {/* City Searchable Dropdown */}
      <div className="space-y-2">
        <Label className="text-sm">City <span className="text-destructive">*</span></Label>
        {cities.length > 0 ? (
          <Controller
            name={`addresses.${index}.city`}
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onValueChange={field.onChange}
                options={cities}
                placeholder="Select city"
                searchPlaceholder="Search cities..."
                emptyMessage="No city found."
                className={cn("h-10", errors.addresses?.[index]?.city && "border-destructive")}
              />
            )}
          />
        ) : (
          <Input
            {...register(`addresses.${index}.city`)}
            placeholder={selectedState ? "Enter city" : "Select state first"}
            className={cn("h-10 input-glow", errors.addresses?.[index]?.city && "border-destructive")}
          />
        )}
        {errors.addresses?.[index]?.city && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.addresses[index].city.message}
          </p>
        )}
      </div>

      {/* Postal Code */}
      <div className="space-y-2">
        <Label className="text-sm">{postalCodeLabel} <span className="text-destructive">*</span></Label>
        <Input
          {...register(`addresses.${index}.postalCode`)}
          placeholder={countryData ? countryData.postalCodeExample : "Postal code"}
          className={cn("h-10 input-glow", errors.addresses?.[index]?.postalCode && "border-destructive")}
        />
        {errors.addresses?.[index]?.postalCode && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.addresses[index].postalCode.message}
          </p>
        )}
      </div>
    </div>
  );
}
